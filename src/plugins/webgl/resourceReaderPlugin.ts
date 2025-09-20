// 增强后的资源读取插件
import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import { GLTFLoader, DRACOLoader, KTX2Loader, MeshoptDecoder } from "../../utils/three-imports"
import {
    TaskScheduler,
    TaskPriority,
    TaskStatus,
    TaskConfig,
    TaskResult,
    AsyncTask,
    QueueConfig,
} from "../../tools/asyncTaskScheduler"

/**
 * 预期功能要求：
 * 1.后端请求到的模型资源文件自动加载到场景中，维护一个资源文件的缓存池
 * 2.每一个模型的加载都形成一个异步任务，维护这个任务队列，加载完成后，通过eventBus进行发布，在主文件中进行订阅，进行资源的加载
 * 3.目前只需要加载gltf、glb模型的加载工作
 * 4.自动注册draco解压插件，对glb/gltf模型进行解压
 * 5.对外暴露一个加载方法，可以传入一个模型路径，进行模型的加载
 */

// 资源加载任务接口
interface LoadingTask {
    id: string
    url: string
    status: "pending" | "loading" | "completed" | "error"
    priority: number
    progress: number
    startTime: number
    model?: THREE.Group | THREE.Scene | THREE.Object3D
    error?: Error
    onProgress?: (progress: any) => void
    onComplete?: (gltf: any) => void
    onError?: (error: Error) => void
}

// 缓存项接口
interface CacheItem {
    url: string
    model: THREE.Group | THREE.Scene | THREE.Object3D
    timestamp: number
    //   size: number
    lastAccessed: number
}

// 插件配置接口
interface ResourceReaderConfig {
    url?: string
    maxCacheSize?: number
    maxConcurrentLoads?: number
    enableDraco?: boolean
    dracoPath?: string
    enableKTX2?: boolean
    ktx2Path?: string
    enableMeshopt?: boolean
    meshoptPath?: string
    supportedFormats?: string[]
    autoDispose?: boolean
}

export class ResourceReaderPlugin extends BasePlugin {
    public gltfLoader!: GLTFLoader
    private dracoLoader: DRACOLoader | null = null
    private ktx2Loader: KTX2Loader | null = null
    private meshoptDecoder: any = null
    private taskScheduler!: TaskScheduler<THREE.Group | THREE.Scene | THREE.Object3D>
    private resourceCache: Map<string, CacheItem> = new Map()

    // 保留旧接口的兼容性
    private loadingTasks: Map<string, LoadingTask> = new Map()
    private loadingQueue: LoadingTask[] = []
    private activeLoads: Set<string> = new Set()

    private config: ResourceReaderConfig
    private baseUrl: string = ""
    private maxCacheSize: number = 100 * 1024 * 1024 // 100MB
    private maxConcurrentLoads: number = 3
    private taskIdCounter: number = 0
    private renderer: any = null;

    // 默认配置参数
    private static readonly DEFAULT_CONFIG: ResourceReaderConfig = {
        url: "", // 基础URL
        maxCacheSize: 1000 * 1024 * 1024, // 1000MB缓存
        maxConcurrentLoads: 3, // 最大并发加载数
        enableDraco: true, // 启用DRACO解压
        dracoPath: "./draco/gltf/", // DRACO解码器路径
        enableKTX2: true, // 启用KTX2纹理压缩
        ktx2Path: "./ktx2/", // KTX2解码器路径 - 修复路径
        enableMeshopt: true, // 启用网格量化
        meshoptPath: "./meshopt/", // Meshopt解码器路径 - 修复路径
        supportedFormats: ["gltf", "glb", "ktx2"], // 支持的格式
        autoDispose: true, // 自动释放过期资源
    }

    /**
     * 创建带有默认配置的ResourceReaderPlugin实例
     * @param config 可选的配置参数
     * @returns ResourceReaderPlugin实例
     */
    static create(config: Partial<ResourceReaderConfig> = {}): ResourceReaderPlugin {
        return new ResourceReaderPlugin(config)
    }

    /**
     * 创建禁用高级压缩的ResourceReaderPlugin实例
     * @param config 可选的配置参数
     * @returns ResourceReaderPlugin实例
     */
    static createBasic(config: Partial<ResourceReaderConfig> = {}): ResourceReaderPlugin {
        return new ResourceReaderPlugin({
            ...config,
            enableDraco: false,
            enableKTX2: false,
            enableMeshopt: false,
        })
    }

    /**
     * 创建高性能配置的ResourceReaderPlugin实例
     * @param config 可选的配置参数
     * @returns ResourceReaderPlugin实例
     */
    static createHighPerformance(config: Partial<ResourceReaderConfig> = {}): ResourceReaderPlugin {
        return new ResourceReaderPlugin({
            ...config,
            maxCacheSize: 500 * 1024 * 1024, // 500MB缓存
            maxConcurrentLoads: 6, // 更高并发
            enableDraco: true,
            autoDispose: false, // 禁用自动释放
        })
    }

    constructor(userData: any = {}) {
        super(userData)

        // 合并用户配置和默认配置
        this.config = {
            ...ResourceReaderPlugin.DEFAULT_CONFIG,
            ...userData,
        }

        // 验证和修正配置
        // this.validateAndNormalizeConfig()

        // 应用配置到实例变量
        this.baseUrl = this.config.url || ""
        this.maxCacheSize = this.config.maxCacheSize!
        this.maxConcurrentLoads = this.config.maxConcurrentLoads!

        console.log("🔧 ResourceReaderPlugin配置:", {
            baseUrl: this.baseUrl || "(无)",
            maxCacheSize: `${(this.maxCacheSize / 1024 / 1024).toFixed(1)}MB`,
            maxConcurrentLoads: this.maxConcurrentLoads,
            enableDraco: this.config.enableDraco,
            dracoPath: this.config.dracoPath,
            enableKTX2: this.config.enableKTX2,
            ktx2Path: this.config.ktx2Path,
            enableMeshopt: this.config.enableMeshopt,
            meshoptPath: this.config.meshoptPath,
            supportedFormats: this.config.supportedFormats,
            autoDispose: this.config.autoDispose,
        })

        this.initializeLoaders(this.config)
        this.initializeTaskScheduler()
    }

    /**
     * 验证和标准化配置参数
     */
    private validateAndNormalizeConfig(): void {
        // 验证缓存大小
        if (this.config.maxCacheSize! < 10 * 1024 * 1024) {
            console.warn("⚠️ 缓存大小过小，建议至少10MB，已调整为10MB")
            this.config.maxCacheSize = 10 * 1024 * 1024
        }
        if (this.config.maxCacheSize! > 2 * 1024 * 1024 * 1024) {
            console.warn("⚠️ 缓存大小过大，建议不超过2GB，已调整为2GB")
            this.config.maxCacheSize = 2 * 1024 * 1024 * 1024
        }

        // 验证并发数
        if (this.config.maxConcurrentLoads! < 1) {
            console.warn("⚠️ 并发数不能小于1，已调整为1")
            this.config.maxConcurrentLoads = 1
        }
        if (this.config.maxConcurrentLoads! > 10) {
            console.warn("⚠️ 并发数过大可能影响性能，建议不超过10")
        }

        // 标准化DRACO路径
        if (this.config.dracoPath && !this.config.dracoPath.endsWith("/")) {
            this.config.dracoPath += "/"
        }

        // 验证支持的格式
        if (!this.config.supportedFormats || this.config.supportedFormats.length === 0) {
            console.warn("⚠️ 未指定支持的格式，使用默认格式")
            this.config.supportedFormats = ["gltf", "glb"]
        }
    }

    /**
     * 初始化加载器
     */
    private initializeLoaders(config: ResourceReaderConfig): void {
        // 初始化GLTF加载器
        this.gltfLoader = new GLTFLoader()

        // 初始化DRACO解压器
        this.initializeDracoLoader(config)

        // 初始化KTX2纹理加载器
        this.initializeKTX2Loader(config)

        // 初始化Meshopt量化解码器
        this.initializeMeshoptDecoder(config)
    }

    /**
     * 初始化DRACO解压器
     */
    private initializeDracoLoader(config: ResourceReaderConfig): void {
        const enableDraco = config.enableDraco !== false
        if (enableDraco) {
            console.log("🔧 初始化DRACO解压器")

            try {
                this.dracoLoader = new DRACOLoader()
                const dracoPath = config.dracoPath || "/draco/"
                this.dracoLoader.setDecoderPath(dracoPath)
                this.dracoLoader.setDecoderConfig({ type: "js" })

                // 设置DRACO解压器到GLTF加载器
                this.gltfLoader.setDRACOLoader(this.dracoLoader)

                console.log("✅ DRACO解压器已设置，路径:", dracoPath)
            } catch (error) {
                console.warn("⚠️ DRACO解压器初始化失败:", error)
                this.dracoLoader = null
            }
        } else {
            console.log("ℹ️ DRACO解压器已禁用")
            this.dracoLoader = null
        }
    }

    /**
     * 初始化KTX2纹理加载器
     */
    private initializeKTX2Loader(config: ResourceReaderConfig): void {
        const enableKTX2 = config.enableKTX2 !== false
        if (enableKTX2) {
            console.log("🔧 初始化KTX2纹理加载器")
            
            try {
                this.ktx2Loader = new KTX2Loader()
                const ktx2Path = config.ktx2Path || "./ktx2/"
                this.ktx2Loader.setTranscoderPath(ktx2Path)
                
                console.log("✅ KTX2纹理加载器已创建")
                console.log("📁 KTX2解码器路径:", ktx2Path)
                console.log("🎯 支持的纹理格式: BASIS Universal、ETC1S、UASTC等")
                console.log("ℹ️ 注意: KTX2支持检测将在renderer初始化后进行")
                
            } catch (error) {
                console.error("❌ KTX2纹理加载器初始化失败:", error)
                this.ktx2Loader = null
            }
        } else {
            console.log("ℹ️ KTX2纹理加载器已禁用")
            this.ktx2Loader = null
        }
    }

    /**
     * 异步初始化KTX2Loader（需要renderer）
     */
    private async initializeKTX2LoaderAsync(): Promise<void> {
        if (!this.ktx2Loader) {
            console.log("⚠️ KTX2Loader未创建，跳过异步初始化")
            return
        }

        try {
            // 检查renderer是否是有效的Three.js WebGLRenderer
            if (this.renderer) {
                console.log("🔧 检测KTX2支持...")
                this.ktx2Loader.detectSupport(this.renderer)
                
                // 等待一小段时间确保支持检测完成
                await new Promise(resolve => setTimeout(resolve, 10))
                
                console.log("✅ KTX2支持检测完成")
            } else {
                console.warn("⚠️ Renderer未提供，无法检测KTX2支持")
            }

            // 设置KTX2加载器到GLTF加载器
            this.gltfLoader.setKTX2Loader(this.ktx2Loader)
            console.log("✅ KTX2加载器已设置到GLTFLoader")
            
        } catch (error) {
            console.error("❌ KTX2异步初始化失败:", error)
            // 即使失败也设置加载器，可能在某些情况下仍能工作
            this.gltfLoader.setKTX2Loader(this.ktx2Loader)
        }
    }

    /**
     * 初始化Meshopt量化解码器
     */
    private initializeMeshoptDecoder(config: ResourceReaderConfig): void {
        const enableMeshopt = config.enableMeshopt !== false
        if (enableMeshopt) {
            console.log("🔧 初始化Meshopt量化解码器")

            try {
                // Meshopt解码器需要异步初始化
                this.initializeMeshoptDecoderAsync(config.meshoptPath || "/meshopt/")
            } catch (error) {
                console.warn("⚠️ Meshopt量化解码器初始化失败:", error)
                console.warn("⚠️ 将无法解码量化的网格数据")
                this.meshoptDecoder = null
            }
        } else {
            console.log("ℹ️ Meshopt量化解码器已禁用")
            this.meshoptDecoder = null
        }
    }

    /**
     * 异步初始化Meshopt解码器
     */
    private async initializeMeshoptDecoderAsync(meshoptPath: string): Promise<void> {
        try {
            // 等待Meshopt解码器准备就绪
            await MeshoptDecoder.ready
            this.meshoptDecoder = MeshoptDecoder

            // 设置Meshopt解码器到GLTF加载器
            this.gltfLoader.setMeshoptDecoder(MeshoptDecoder)

            console.log("✅ Meshopt量化解码器已设置")
            console.log("✅ 支持网格量化、压缩和优化")
        } catch (error) {
            console.warn("⚠️ Meshopt量化解码器异步初始化失败:", error)
            this.meshoptDecoder = null
        }
    }

    /**
     * 初始化任务调度器
     */
    private initializeTaskScheduler(): void {
        const queueConfig: Partial<QueueConfig> = {
            maxConcurrentTasks: this.maxConcurrentLoads,
            maxQueueSize: 200,
            defaultTimeout: 60000,
            defaultRetryCount: 3,
            priorityWeights: {
                [TaskPriority.LOW]: 1,
                [TaskPriority.NORMAL]: 2,
                [TaskPriority.HIGH]: 4,
                [TaskPriority.URGENT]: 8,
            },
        }

        // 创建模型加载执行器
        const modelExecutor = async (
            task: AsyncTask<THREE.Group | THREE.Scene | THREE.Object3D>,
        ): Promise<THREE.Group | THREE.Scene | THREE.Object3D> => {
            return new Promise((resolve, reject) => {
                task.config.url = task.config.url.replace(/\\/g, "/")

                this.gltfLoader.load(
                    task.config.url,
                    // onLoad
                    (gltf: any) => {
                        // 处理模型：设置名称和建筑模型特殊逻辑
                        const processedModel = this.processLoadedModel(gltf.scene, task.config.url)

                        resolve(processedModel)
                    },
                    // onProgress
                    (progress: any) => {
                        if (progress.lengthComputable) {
                            const percentage = (progress.loaded / progress.total) * 100
                            eventBus.emit("task:progress", {
                                taskId: task.config.id,
                                loaded: progress.loaded,
                                total: progress.total,
                                percentage,
                                stage: "loading",
                            })
                        }
                    },
                    // onError
                    (error: any) => {
                        console.error(`❌ 异步加载失败: ${task.config.url}`, error)
                        reject(error)
                    },
                )
            })
        }

        this.taskScheduler = new TaskScheduler<THREE.Group | THREE.Scene | THREE.Object3D>(modelExecutor, queueConfig)
        this.taskScheduler.start()

        console.log("🚀 异步任务调度器已初始化并启动")
    }

    /**
     * 验证DRACO解码器文件是否存在
     */
    private async verifyDracoDecoder(dracoPath: string): Promise<void> {
        try {
            const testUrls = [
                `${dracoPath}draco_decoder.wasm`,
                `${dracoPath}draco_decoder.js`,
                `${dracoPath}draco_wasm_wrapper.js`,
            ]

            // 检查关键文件是否存在（仅在开发环境）
            if (process.env.NODE_ENV === "development") {
                console.log("🔍 验证DRACO解码器文件...")
                for (const url of testUrls) {
                    try {
                        const response = await fetch(url, { method: "HEAD" })
                        if (response.ok) {
                            console.log(`✅ DRACO文件存在: ${url}`)
                        } else {
                            console.warn(`⚠️ DRACO文件不存在: ${url}`)
                        }
                    } catch (error) {
                        console.warn(`⚠️ 无法验证DRACO文件: ${url}`, error)
                    }
                }
            }
        } catch (error) {
            console.warn("⚠️ DRACO解码器验证失败:", error)
        }
    }

    /**
     * 插件初始化
     */
    async init(): Promise<void> {
        // 异步初始化KTX2Loader（需要renderer支持检测）
        await this.initializeKTX2LoaderAsync()

        // 监听资源释放事件
        eventBus.on("resource:dispose", (url: string) => {
            this.disposeResource(url)
        })

        // 监听缓存清理事件
        eventBus.on("resource:clearCache", () => {
            this.clearCache()
        })

        // 定时清理过期缓存
        this.startCacheCleanup()
    }

    /**
     * 基类要求的load方法
     */
    async load(): Promise<void> {
        // 基类要求的方法，这里可以留空
    }

    /**
     * 异步加载GLTF/GLB模型 - 新的推荐方法
     */
    public async loadModelAsync(
        url: string,
        priority: TaskPriority = TaskPriority.NORMAL,
        options: {
            timeout?: number
            retryCount?: number
            category?: string
            metadata?: any
        } = {},
    ): Promise<THREE.Group | THREE.Scene | THREE.Object3D> {
        const fullUrl = this.resolveUrl(url)

        // 检查缓存
        const cached = this.getCachedResource(fullUrl)
        if (cached) {
            console.log(`📦 从缓存异步加载模型: ${url}`)
            eventBus.emit("resource:loaded", { url: fullUrl, fromCache: true })
            return cached.model.clone()
        }

        // 创建任务配置
        const taskConfig: TaskConfig = {
            id: this.generateTaskId(),
            url: fullUrl,
            priority,
            timeout: options.timeout,
            retryCount: options.retryCount,
            category: options.category || "model",
            metadata: options.metadata,
        }

        try {
            // 调度任务
            const result = await this.taskScheduler.schedule(taskConfig)
            if (result.success && result.data) {
                // 添加到缓存
                this.addToCache(fullUrl, result.data)

                eventBus.emit("resource:loaded", {
                    url: fullUrl,
                    model: result.data,
                    loadTime: result.executionTime,
                    fromCache: false,
                })

                // 设置模型名称
                this.setModelName(result.data, this.extractFileNameFromPath(fullUrl))

                return result.data
            } else {
                console.error(`❌ 任务执行失败: ${taskConfig.id}`, result.error)
                throw result.error || new Error("Load failed")
            }
        } catch (error) {
            console.error(`❌ 异步加载失败: ${url}`, error)
            eventBus.emit("resource:error", {
                url: fullUrl,
                error: error instanceof Error ? error.message : String(error),
            })
            throw error
        }
    }

    /**
     * 批量异步加载模型
     */
    public async loadBatchAsync(
        urls: string[],
        priority: TaskPriority = TaskPriority.NORMAL,
        options: {
            timeout?: number
            retryCount?: number
            category?: string
        } = {},
    ): Promise<Array<{ url: string; model?: THREE.Group | THREE.Scene | THREE.Object3D; error?: Error }>> {
        console.log(`📥 开始批量异步加载 ${urls.length} 个模型`)

        const taskConfigs = urls.map(url => ({
            id: this.generateTaskId(),
            url: this.resolveUrl(url),
            priority,
            timeout: options.timeout,
            retryCount: options.retryCount,
            category: options.category || "batch",
            metadata: { originalUrl: url },
        }))

        try {
            const results = await this.taskScheduler.scheduleBatch(taskConfigs)

            return results.map((result, index) => {
                const originalUrl = urls[index]

                if (result.success && result.data) {
                    // 添加到缓存
                    this.addToCache(taskConfigs[index].url, result.data)

                    return {
                        url: originalUrl,
                        model: result.data,
                    }
                } else {
                    return {
                        url: originalUrl,
                        error: result.error || new Error("Load failed"),
                    }
                }
            })
        } catch (error) {
            console.error("❌ 批量异步加载失败", error)
            throw error
        }
    }

    /**
     * 取消异步加载任务
     */
    public cancelAsyncLoad(taskId: string): boolean {
        return this.taskScheduler.cancel(taskId)
    }

    /**
     * 获取异步任务状态
     */
    public getAsyncTaskStatus(taskId: string): TaskStatus | null {
        return this.taskScheduler.getTaskStatus(taskId)
    }

    /**
     * 获取调度器状态
     */
    public getSchedulerStatus() {
        return this.taskScheduler.getStatus()
    }

    /**
     * 加载GLTF/GLB模型 - 兼容旧接口
     */
    public loadModel(
        url: string,
        onComplete?: (gltf: any) => void,
        onProgress?: (progress: any) => void,
        onError?: (error: Error) => void,
        priority: number = 0,
    ): string {
        const fullUrl = this.resolveUrl(url)

        // 检查缓存
        const cached = this.getCachedResource(fullUrl)
        if (cached) {
            console.log(`📦 从缓存加载模型: ${url}`)
            if (onComplete) {
                // 克隆缓存的模型以避免引用问题
                const clonedModel = cached.model.clone()
                onComplete({ scene: clonedModel })
            }
            eventBus.emit("resource:loaded", { url: fullUrl, fromCache: true })
            return "cached"
        }

        // 创建加载任务
        const taskId = this.generateTaskId()
        const task: LoadingTask = {
            id: taskId,
            url: fullUrl,
            status: "pending",
            priority,
            progress: 0,
            startTime: Date.now(),
            onProgress,
            onComplete,
            onError,
        }

        this.loadingTasks.set(taskId, task)
        this.addToQueue(task)

        console.log(`📥 添加加载任务: ${url} (ID: ${taskId})`)

        // 处理队列
        this.processQueue()

        return taskId
    }

    /**
     * 批量加载模型
     */
    public loadBatch(urls: string[], onBatchComplete?: (results: any[]) => void): string[] {
        const taskIds: string[] = []
        const results: any[] = []
        let completedCount = 0

        urls.forEach((url, index) => {
            const taskId = this.loadModel(
                url,
                (gltf: any) => {
                    results[index] = { url, gltf, success: true }
                    completedCount++

                    if (completedCount === urls.length && onBatchComplete) {
                        onBatchComplete(results)
                    }
                },
                undefined,
                (error: Error) => {
                    results[index] = { url, error, success: false }
                    completedCount++

                    if (completedCount === urls.length && onBatchComplete) {
                        onBatchComplete(results)
                    }
                },
                index, // 使用索引作为优先级，保持顺序
            )
            taskIds.push(taskId)
        })

        return taskIds
    }

    /**
     * 取消加载任务
     */
    public cancelLoad(taskId: string): boolean {
        const task = this.loadingTasks.get(taskId)
        if (!task) return false

        if (task.status === "loading") {
            this.activeLoads.delete(taskId)
        }

        // 从队列中移除
        const queueIndex = this.loadingQueue.findIndex(t => t.id === taskId)
        if (queueIndex > -1) {
            this.loadingQueue.splice(queueIndex, 1)
        }

        this.loadingTasks.delete(taskId)
        console.log(`❌ 取消加载任务: ${taskId}`)

        eventBus.emit("resource:cancelled", { taskId, url: task.url })
        return true
    }

    /**
     * 获取加载进度
     */
    public getLoadingProgress(): { total: number; completed: number; progress: number } {
        const total = this.loadingTasks.size
        const completed = Array.from(this.loadingTasks.values()).filter(task => task.status === "completed").length

        const progress = total > 0 ? (completed / total) * 100 : 0

        return { total, completed, progress }
    }

    /**
     * 处理加载队列
     */
    private processQueue(): void {
        if (this.activeLoads.size >= this.maxConcurrentLoads) {
            return
        }

        // 按优先级排序
        this.loadingQueue.sort((a, b) => b.priority - a.priority)

        const availableSlots = this.maxConcurrentLoads - this.activeLoads.size
        const tasksToProcess = this.loadingQueue.splice(0, availableSlots)

        tasksToProcess.forEach(task => {
            this.executeLoad(task)
        })
    }

    /**
     * 执行具体的加载操作 - 直接使用配置好的GLTFLoader
     */
    private executeLoad(task: LoadingTask): void {
        task.status = "loading"
        this.activeLoads.add(task.id)

        console.log(`🔄 开始加载: ${task.url}`)
        console.log(`🔧 使用${this.dracoLoader ? "DRACO增强" : "基础"}GLTFLoader`)

        this.gltfLoader.load(
            task.url,
            // onLoad
            (gltf: any) => {
                console.log(`✅ 模型加载成功: ${task.url}`)
                this.onLoadComplete(task, gltf)
            },
            // onProgress
            (progress: any) => {
                this.onLoadProgress(task, progress)
            },
            // onError
            (error: any) => {
                console.error(`❌ 模型加载失败: ${task.url}`, error)
                // this.onLoadError(task, error as Error)
            },
        )
    }

    /**
     * 加载完成处理
     */
    private onLoadComplete(task: LoadingTask, gltf: any): void {
        task.status = "completed"
        task.progress = 100

        // 处理模型：设置名称和建筑模型特殊逻辑
        const processedModel = this.processLoadedModel(gltf.scene, task.url)
        task.model = processedModel

        // 添加到缓存
        this.addToCache(task.url, processedModel)

        // 执行回调，将处理后的模型放回gltf对象
        if (task.onComplete) {
            const enhancedGltf = { ...gltf, scene: processedModel }
            task.onComplete(enhancedGltf)
        }

        // 清理并处理下一个任务
        this.activeLoads.delete(task.id)

        const loadTime = Date.now() - task.startTime
        console.log(`✅ 模型加载完成: ${task.url} (${loadTime}ms)`)

        eventBus.emit("resource:loaded", {
            url: task.url,
            model: processedModel,
            loadTime,
            fromCache: false,
            fileName: processedModel.name,
        })

        // 处理队列中的下一个任务
        this.processQueue()
    }

    /**
     * 加载进度处理
     */
    private onLoadProgress(task: LoadingTask, progress: any): void {
        if (progress.lengthComputable) {
            task.progress = (progress.loaded / progress.total) * 100
        }

        if (task.onProgress) {
            task.onProgress(progress)
        }

        eventBus.emit("resource:progress", {
            taskId: task.id,
            url: task.url,
            progress: task.progress,
            loaded: progress.loaded,
            total: progress.total,
        })
    }

    /**
     * 加载错误处理
     */
    private onLoadError(task: LoadingTask, error: Error): void {
        task.status = "error"
        task.error = error

        // 详细的错误分析
        let errorCategory = "unknown"
        let suggestion = ""

        // 安全地获取错误消息
        const errorMessage = error && error.message ? String(error.message) : ""

        if (errorMessage.includes("DRACO") || errorMessage.includes("draco")) {
            errorCategory = "draco"
            suggestion = "建议检查DRACO解码器文件是否存在于/draco/目录"
        } else if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
            errorCategory = "not_found"
            suggestion = "请检查模型文件路径是否正确"
        } else if (errorMessage.includes("JSON") || errorMessage.includes("Unexpected token")) {
            errorCategory = "format"
            suggestion = "可能收到了HTML页面而不是模型文件，请检查服务器配置"
        } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
            errorCategory = "network"
            suggestion = "网络连接问题，请检查网络状态"
        }

        console.error(`❌ 模型加载失败: ${task.url}`)
        console.error(`🔍 错误类型: ${errorCategory}`)
        console.error(`💡 建议: ${suggestion}`)
        console.error(`📋 错误详情:`, error)

        // 如果是DRACO相关错误，提供额外信息
        if (errorCategory === "draco") {
            console.error("🔧 DRACO故障排除:")
            console.error("   1. 检查 /draco/ 目录是否存在")
            console.error("   2. 确认以下文件存在:")
            console.error("      - draco_decoder.wasm")
            console.error("      - draco_decoder.js")
            console.error("      - draco_wasm_wrapper.js")
            console.error("   3. 检查服务器是否正确提供WASM文件")
        }

        if (task.onError) {
            // 创建增强的错误对象
            const enhancedError = new Error(`${errorMessage} (类型: ${errorCategory})`)
            enhancedError.name = error && error.name ? error.name : "Error"
            enhancedError.stack = error && error.stack ? error.stack : undefined
            task.onError(enhancedError)
        }

        this.activeLoads.delete(task.id)

        eventBus.emit("resource:error", {
            taskId: task.id,
            url: task.url,
            error: errorMessage,
            category: errorCategory,
            suggestion,
        })

        // 处理队列中的下一个任务
        this.processQueue()
    }

    /**
     * 添加任务到队列
     */
    private addToQueue(task: LoadingTask): void {
        this.loadingQueue.push(task)
    }

    /**
     * 解析完整URL
     */
    private resolveUrl(url: string): string {
        if (url.startsWith("http") || url.startsWith("/")) {
            return url
        }
        return this.baseUrl + (this.baseUrl.endsWith("/") ? "" : "/") + url
    }

    /**
     * 生成任务ID
     */
    private generateTaskId(): string {
        return `task_${++this.taskIdCounter}_${Date.now()}`
    }

    /**
     * 添加到缓存
     */
    private addToCache(url: string, model: THREE.Group | THREE.Scene | THREE.Object3D): void {
        // const size = this.estimateModelSize(model)

        // 检查缓存容量
        // this.ensureCacheSpace(size)

        const cacheItem: CacheItem = {
            url,
            model: model.clone(), // 存储克隆以避免引用问题
            timestamp: Date.now(),
            //   size,
            lastAccessed: Date.now(),
        }

        this.resourceCache.set(url, cacheItem)
        // console.log(`💾 模型已缓存: ${url} (${(size / 1024).toFixed(2)}KB)`)
    }

    /**
     * 从缓存获取资源
     */
    private getCachedResource(url: string): CacheItem | null {
        const cached = this.resourceCache.get(url)
        if (cached) {
            cached.lastAccessed = Date.now()
            return cached
        }
        return null
    }

    /**
     * 确保缓存空间足够
     */
    private ensureCacheSpace(requiredSize: number): void {
        // const currentSize = this.getCurrentCacheSize()

        // if (currentSize + requiredSize <= this.maxCacheSize) {
        //   return
        // }

        // 按最后访问时间排序，移除最旧的
        const entries: [string, CacheItem][] = []
        this.resourceCache.forEach((value, key) => {
            entries.push([key, value])
        })
        entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

        let freedSpace = 0
        for (const [url, item] of entries) {
            this.resourceCache.delete(url)
            item.model.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose()
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose())
                    } else {
                        child.material?.dispose()
                    }
                }
            })

            //   freedSpace += item.size
            console.log(`🗑️ 清理缓存: ${url}`)

            if (freedSpace >= requiredSize) {
                break
            }
        }
    }

    /**
     * 估算模型大小
     */
    private estimateModelSize(model: THREE.Group | THREE.Scene | THREE.Object3D): number {
        let size = 0

        model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                // 估算几何体大小
                const geometry = child.geometry
                if (geometry.attributes.position) {
                    size += geometry.attributes.position.array.length * 4 // float32
                }
                if (geometry.attributes.normal) {
                    size += geometry.attributes.normal.array.length * 4
                }
                if (geometry.attributes.uv) {
                    size += geometry.attributes.uv.array.length * 4
                }
                if (geometry.index) {
                    size += geometry.index.array.length * 4
                }
            }
        })

        return size
    }

    /**
     * 获取当前缓存大小
     */
    //   private getCurrentCacheSize(): number {
    //     let total = 0
    //     this.resourceCache.forEach((item) => {
    //       total += item.size
    //     })
    //     return total
    //   }
    
    /**
     * 清理特定资源
     */
    public disposeResource(url: string): void {
        const cached = this.resourceCache.get(url)
        if (cached) {
            cached.model.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose()
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose())
                    } else {
                        child.material?.dispose()
                    }
                }
            })

            this.resourceCache.delete(url)
            console.log(`🗑️ 资源已释放: ${url}`)
        }
    }

    /**
     * 清理所有缓存
     */
    public clearCache(): void {
        const urls: string[] = []
        this.resourceCache.forEach((_, url) => {
            urls.push(url)
        })

        for (const url of urls) {
            this.disposeResource(url)
        }
        console.log("🧹 缓存已全部清理")
    }

    /**
     * 开始缓存清理定时器
     */
    private startCacheCleanup(): void {
        setInterval(
            () => {
                const now = Date.now()
                const expireTime = 30 * 60 * 1000 // 30分钟

                const urlsToClean: string[] = []
                this.resourceCache.forEach((item, url) => {
                    if (now - item.lastAccessed > expireTime) {
                        urlsToClean.push(url)
                    }
                })

                for (const url of urlsToClean) {
                    this.disposeResource(url)
                }
            },
            5 * 60 * 1000,
        ) // 每5分钟检查一次
    }

    /**
     * 获取缓存状态
     */
    public getCacheStatus(): {
        // size: number
        maxSize: number
        itemCount: number
        // utilization: number
        dracoEnabled: boolean
        ktx2Enabled: boolean
        meshoptEnabled: boolean
    } {
        // const size = this.getCurrentCacheSize()
        const itemCount = this.resourceCache.size
        // const utilization = (size / this.maxCacheSize) * 100

        return {
            //   size,
            maxSize: this.maxCacheSize,
            itemCount,
            //   utilization,
            dracoEnabled: !!this.dracoLoader,
            ktx2Enabled: !!this.ktx2Loader,
            meshoptEnabled: !!this.meshoptDecoder,
        }
    }

    /**
     * 获取加载器配置信息
     */
    public getLoaderInfo(): {
        dracoEnabled: boolean
        dracoPath: string | undefined
        ktx2Enabled: boolean
        ktx2Path: string | undefined
        meshoptEnabled: boolean
        meshoptPath: string | undefined
        supportedFormats: string[]
    } {
        return {
            dracoEnabled: !!this.dracoLoader,
            dracoPath: this.config.dracoPath,
            ktx2Enabled: !!this.ktx2Loader,
            ktx2Path: this.config.ktx2Path,
            meshoptEnabled: !!this.meshoptDecoder,
            meshoptPath: this.config.meshoptPath,
            supportedFormats: this.config.supportedFormats || ["gltf", "glb", "ktx2"],
        }
    }

    /**
     * 获取加载任务状态
     */
    public getTasksStatus(): {
        pending: number
        loading: number
        completed: number
        error: number
    } {
        const tasks = Array.from(this.loadingTasks.values())

        return {
            pending: tasks.filter(t => t.status === "pending").length,
            loading: tasks.filter(t => t.status === "loading").length,
            completed: tasks.filter(t => t.status === "completed").length,
            error: tasks.filter(t => t.status === "error").length,
        }
    }

    /**
     * 预加载资源列表
     */
    public preload(urls: string[]): Promise<any[]> {
        return new Promise(resolve => {
            this.loadBatch(urls, results => {
                const failed = results.filter(r => !r.success)
                if (failed.length > 0) {
                    console.warn(`⚠️ 预加载完成，但有${failed.length}个资源加载失败`)
                }
                resolve(results)
            })
        })
    }

    /**
     * 设置模型名称
     */
    public setModelName(object: THREE.Group | THREE.Scene | THREE.Object3D, baseName: string): void {
        if (!object) return

        // 将名称存储到userData中（新的命名规则）
        if (!object.userData) {
            object.userData = {}
        }
        object.userData.modelName = baseName

        // 同时保留object.name用于显示和调试
        object.name = baseName
    }

    /**
     * 获取模型名称
     */
    public getModelName(object: THREE.Group | THREE.Scene | THREE.Object3D): string {
        if (!object) return "未命名模型"

        // 优先使用userData.modelName
        if (object.userData && object.userData.modelName) {
            return object.userData.modelName
        }

        // 向后兼容：如果userData.modelName不存在，使用object.name
        return object.name || "未命名模型"
    }

    /**
     * 从文件路径提取文件名
     */
    public extractFileNameFromPath(filePath: string): string {
        if (!filePath) {
            return `model_${Date.now()}`
        }

        try {
            // 处理各种路径格式
            const cleanPath = filePath.replace(/\\/g, "/")
            const pathParts = cleanPath.split("/")
            const fullFileName = pathParts[pathParts.length - 1]

            // 移除文件扩展名
            const dotIndex = fullFileName.lastIndexOf(".")
            const fileNameWithoutExt = dotIndex > 0 ? fullFileName.substring(0, dotIndex) : fullFileName

            // 清理文件名，移除特殊字符
            const cleanFileName = fileNameWithoutExt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")

            return cleanFileName || `model_${Date.now()}`
        } catch (error) {
            console.warn("文件名提取失败，使用默认名称:", error)
            return `model_${Date.now()}`
        }
    }

    /**
     * 调试KTX2配置和状态
     */
    public debugKTX2Status(): void {
        console.log("🔍 KTX2调试信息:")
        console.log("├── KTX2Loader状态:", this.ktx2Loader ? "已创建" : "未创建")
        
        if (this.ktx2Loader) {
            console.log("├── 转码器路径:", this.config.ktx2Path)
            console.log("├── Renderer状态:", this.renderer ? "已设置" : "未设置")
            
            // 检查GLTFLoader是否已设置KTX2Loader
            const hasKTX2 = (this.gltfLoader as any).ktx2Loader !== undefined
            console.log("├── GLTFLoader中的KTX2:", hasKTX2 ? "已设置" : "未设置")
        }
        
        console.log("└── 配置启用状态:", this.config.enableKTX2)
    }

    /**
     * 验证KTX2解码器文件
     */
    public async verifyKTX2Files(): Promise<void> {
        const ktx2Path = this.config.ktx2Path || "./ktx2/"
        const testFiles = [
            "basis_transcoder.js",
            "basis_transcoder.wasm"
        ]
        
        console.log("🔍 验证KTX2解码器文件...")
        
        for (const file of testFiles) {
            try {
                const response = await fetch(`${ktx2Path}${file}`, { method: "HEAD" })
                if (response.ok) {
                    console.log(`✅ ${file}: 存在`)
                } else {
                    console.error(`❌ ${file}: 不存在 (${response.status})`)
                }
            } catch (error) {
                console.error(`❌ ${file}: 无法访问`, error)
            }
        }
    }

    /**
     * 调试方法：测试异步加载流程
     */
    public async debugLoadFlow(url: string): Promise<void> {
        console.log("🔍 开始调试加载流程...")

        const fullUrl = this.resolveUrl(url)
        console.log(`📍 完整URL: ${fullUrl}`)

        // 检查缓存
        const cached = this.getCachedResource(fullUrl)
        console.log(`💾 缓存检查结果: ${cached ? "有缓存" : "无缓存"}`)

        if (cached) {
            console.log("✅ 从缓存返回，流程结束")
            return
        }

        // 检查任务调度器状态
        const schedulerStatus = this.taskScheduler.getStatus()
        console.log("📊 调度器状态:", schedulerStatus)

        // 检查加载器状态
        console.log("🔧 GLTFLoader状态:", this.gltfLoader ? "已初始化" : "未初始化")
        console.log("🔧 DRACOLoader状态:", this.dracoLoader ? "已初始化" : "未初始化")
        console.log("🔧 KTX2Loader状态:", this.ktx2Loader ? "已初始化" : "未初始化")

        // 调试KTX2状态
        this.debugKTX2Status()

        console.log("➡️ 准备创建任务配置并调度...")
    }

    /**
     * 销毁插件
     */
    dispose(): void {
        // 销毁异步任务调度器
        if (this.taskScheduler) {
            this.taskScheduler.destroy()
        }

        // 取消所有加载任务（兼容旧接口）
        const taskIds = Array.from(this.loadingTasks.keys())
        for (const taskId of taskIds) {
            this.cancelLoad(taskId)
        }

        // 清理缓存
        this.clearCache()

        // 清理加载器
        if (this.dracoLoader) {
            this.dracoLoader.dispose()
        }

        if (this.ktx2Loader) {
            this.ktx2Loader.dispose()
        }

        // Meshopt解码器不需要显式销毁
        this.meshoptDecoder = null

        console.log("🧹 ResourceReaderPlugin已销毁")
    }

    private processLoadedModel(
        model: THREE.Group | THREE.Scene | THREE.Object3D,
        url: string,
    ): THREE.Group | THREE.Scene | THREE.Object3D {
        const fileName = this.extractFileNameFromPath(url)

        // 使用统一的模型名称设置方法
        this.setModelName(model, fileName)

        const isBuildingModelFlag = this.isBuildingModel(fileName)

        // 🔧 修复：为建筑模型设置标识
        if (isBuildingModelFlag) {
            if (!model.userData) {
                model.userData = {}
            }
            model.userData.isBuildingModel = true
            model.userData.isInteractive = true
            console.log(`🏢 检测到建筑模型: ${fileName}`)
        }

        return model
    }



    //
    private isBuildingModel(fileName: string): boolean {
        // return fileName === 'MAIN_BUILDING'
        // 建筑模型的文件名必须包含MAIN_BUILDING，而且以MAIN_BUILDING结尾
        return fileName.includes("MAIN_BUILDING") && fileName.endsWith("MAIN_BUILDING")
    }
}
