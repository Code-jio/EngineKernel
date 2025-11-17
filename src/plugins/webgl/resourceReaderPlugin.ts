// 增强后的资源读取插件
import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import { GLTFLoader, DRACOLoader, KTX2Loader, MeshoptDecoder } from "../../utils/three-imports"
import {
    registerServiceWorkerImproved,
    isServiceWorkerActive,
    forceActivateServiceWorker,
} from "../../utils/serviceWorkerRegisterImproved"

import { CacheConfig, CacheStatistics, GLTFModelCacheData, GLTFModelCache } from "../../tools/cache"

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
 * 1.后端请求到的模型资源文件自动加载到场景中，维护一个资源文件的缓存池 X
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
    private serviceWorkerRegistration: ServiceWorkerRegistration | null = null

    // 保留旧接口的兼容性
    private loadingTasks: Map<string, LoadingTask> = new Map()
    private loadingQueue: LoadingTask[] = []
    private activeLoads: Set<string> = new Set()

    private config: ResourceReaderConfig
    private baseUrl: string = ""
    private maxCacheSize: number = 100 * 1024 * 1024 // 100MB
    private maxConcurrentLoads: number = 3
    private taskIdCounter: number = 0
    private renderer: any = null

    // 默认配置参数
    private static readonly DEFAULT_CONFIG: ResourceReaderConfig = {
        url: "", // 基础URL
        maxCacheSize: 1000 * 1024 * 1024, // 1000MB缓存
        maxConcurrentLoads: 3, // 最大并发加载数
        enableDraco: true, // 启用DRACO解压
        dracoPath: "./draco/gltf/", // DRACO解码器路径
        enableKTX2: true, // 启用KTX2纹理压缩
        ktx2Path: "./ktx2/", // KTX2解码器路径
        enableMeshopt: true, // 启用网格量化
        meshoptPath: "./meshopt/", // Meshopt解码器路径
        supportedFormats: ["gltf", "glb", "ktx2"], // 支持的格式
        autoDispose: true, // 自动释放过期资源
    }

    constructor(userData: any = {}) {
        super(userData)

        // 合并用户配置和默认配置
        this.config = {
            ...ResourceReaderPlugin.DEFAULT_CONFIG,
            ...userData,
        }

        // 应用配置到实例变量
        this.baseUrl = this.config.url || ""
        this.maxCacheSize = this.config.maxCacheSize!
        this.maxConcurrentLoads = this.config.maxConcurrentLoads!
    }

    /**
     * 初始化，默认执行
     */
    public async initialize() {
        this.initializeTaskScheduler()
        this.initializeDracoLoader(this.config) // 初始化DRACO解压器
        this.initializeKTX2Loader(this.config) // 初始化KTX2纹理加载器
        this.initializeMeshoptDecoder(this.config) // 初始化Meshopt量化解码器
        // await this.initializeServiceWorker() // 初始化Service Worker网络拦截器
    }

    /**
     * 初始化DRACO解压器
     */
    private initializeDracoLoader(config: ResourceReaderConfig): void {
        this.gltfLoader = new GLTFLoader()
        const enableDraco = config.enableDraco !== false
        if (enableDraco) {
            try {
                this.dracoLoader = new DRACOLoader()
                const dracoPath = config.dracoPath || "/draco/"
                this.dracoLoader.setDecoderPath(dracoPath)
                this.dracoLoader.setDecoderConfig({ type: "js" })

                // 设置DRACO解压器到GLTF加载器
                this.gltfLoader.setDRACOLoader(this.dracoLoader)
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
            try {
                this.ktx2Loader = new KTX2Loader()
                const ktx2Path = config.ktx2Path || "./ktx2/"
                this.ktx2Loader.setTranscoderPath(ktx2Path)
            } catch (error) {
                console.error("❌ KTX2纹理加载器初始化失败:", error)
                this.ktx2Loader = null
            }
        } else {
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
                this.ktx2Loader.detectSupport(this.renderer)

                // 等待一小段时间确保支持检测完成
                await new Promise(resolve => setTimeout(resolve, 10))
            } else {
                console.warn("⚠️ Renderer未提供，无法检测KTX2支持")
            }

            // 设置KTX2加载器到GLTF加载器
            this.gltfLoader.setKTX2Loader(this.ktx2Loader)
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
            try {
                // Meshopt解码器需要异步初始化
                this.initializeMeshoptDecoderAsync(config.meshoptPath || "/meshopt/")
            } catch (error) {
                console.warn("⚠️ Meshopt量化解码器初始化失败:", error)
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
    }

    /**
     * 初始化Service Worker网络拦截器
     * 改进版本：确保立即激活并开始拦截网络请求
     */
    private async initializeServiceWorker(): Promise<void> {
        // 检查浏览器是否支持 Service Worker
        if (!("serviceWorker" in navigator)) {
            console.warn("[ResourceReaderPlugin] Service Worker 不支持")
            return
        }

        try {
            console.log("[ResourceReaderPlugin] 开始Service Worker初始化...")
            
            // 1. 尝试强制激活已有的Service Worker（如果存在）
            console.log("[ResourceReaderPlugin] 步骤1: 检查现有Service Worker控制...")
            await this.ensureServiceWorkerControl()

            // 2. 检查是否已经有Service Worker控制页面
            console.log("[ResourceReaderPlugin] 步骤2: 检查Service Worker活动状态...")
            const isActive = await isServiceWorkerActive()
            if (!isActive) {
                console.log("[ResourceReaderPlugin] 步骤3: 注册新的Service Worker...")
                
                // 注册新的Service Worker
                const { registration, controller } = await registerServiceWorkerImproved({
                    swPath: "/network-interceptor-sw.js",
                    scope: "/",
                    forceUpdate: true,
                    timeout: 30000, // 增加注册超时到30秒
                })

                // Service Worker 注册成功后的处理
                this.serviceWorkerRegistration = registration
                console.log("[ResourceReaderPlugin] Service Worker 注册成功:", {
                    scope: registration.scope,
                    state: registration.active?.state || registration.installing?.state || "unknown"
                })
            } else {
                console.log("[ResourceReaderPlugin] 步骤3: 获取现有Service Worker注册...")
                
                // 获取现有注册信息
                const registration = await navigator.serviceWorker.ready
                this.serviceWorkerRegistration = registration
                console.log("[ResourceReaderPlugin] 现有Service Worker状态:", {
                    scope: registration.scope,
                    active: !!registration.active,
                    installing: !!registration.installing,
                    waiting: !!registration.waiting
                })
            }

            // 4. 设置消息监听器
            console.log("[ResourceReaderPlugin] 步骤4: 设置消息监听器...")
            this.setupServiceWorkerMessageListener()

            // 5. 确认与Service Worker的连接
            console.log("[ResourceReaderPlugin] 步骤5: 确认Service Worker连接...")
            await this.confirmServiceWorkerConnection()
            
            console.log("[ResourceReaderPlugin] ✅ Service Worker 初始化完成")
        } catch (error) {
            console.error("❌ Service Worker 初始化失败:", error)
            
            // 初始化失败时的降级处理
            console.warn("[ResourceReaderPlugin] Service Worker初始化失败，将继续使用基础功能")
            
            // 不抛出错误，让应用可以继续运行
        }
    }

    /**
     * 确保Service Worker控制页面
     */
    private async ensureServiceWorkerControl(): Promise<void> {
        // 如果已经有控制器，检查是否需要强制激活
        if (navigator.serviceWorker.controller) {
            return
        }

        // 检查是否有等待的Service Worker
        try {
            const registration = await navigator.serviceWorker.ready
            if (registration.waiting) {
                await forceActivateServiceWorker()
            }
        } catch (error) {
            console.warn("[ResourceReaderPlugin] 检查Service Worker状态失败:", error)
        }
    }

    /**
     * 设置Service Worker消息监听器
     */
    private setupServiceWorkerMessageListener(): void {
        // 移除旧监听器（如果存在）
        if (this.serviceWorkerMessageHandler) {
            navigator.serviceWorker.removeEventListener("message", this.serviceWorkerMessageHandler)
        }

        // 设置新的监听器
        this.serviceWorkerMessageHandler = (event: MessageEvent) => {
            const { type, data } = event.data

            switch (type) {
                case "NETWORK_REQUEST":
                    // 通过事件总线发送网络请求信息
                    eventBus.emit("network:request", data)
                    break

                case "NETWORK_RESPONSE":
                    // 通过事件总线发送网络响应信息
                    eventBus.emit("network:response", data)
                    break

                case "NETWORK_ERROR":
                    console.error("❌ Service Worker 网络请求失败:", data)
                    // 通过事件总线发送网络错误信息
                    eventBus.emit("network:error", data)
                    break

                case "SW_ACTIVATED":
                    console.log("[ResourceReaderPlugin] Service Worker 已激活")
                    break

                case "CONNECTION_CONFIRMED":
                    console.log("[ResourceReaderPlugin] Service Worker 连接已确认")
                    break

                case "IMMEDIATE_ACTIVATION_CONFIRMED":
                    // 立即激活成功，可以在这里记录状态
                    console.log("[ResourceReaderPlugin] Service Worker 立即激活成功")
                    break

                case "PONG":
                    // 服务端响应PING，可以记录延迟
                    const latency = Date.now() - (data?.timestamp || Date.now())
                    console.log(`[ResourceReaderPlugin] Service Worker 延迟: ${latency}ms`)
                    break

                default:
                    // 静默处理未知消息类型，避免警告信息
                    break
            }
        }

        navigator.serviceWorker.addEventListener("message", this.serviceWorkerMessageHandler)
    }
    /**
     * 确认与Service Worker的连接
     */
    private async confirmServiceWorkerConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now()
            const timeout = 20000 // 增加超时到20秒

            const timeoutId = setTimeout(() => {
                const elapsed = Date.now() - startTime
                reject(new Error(`Service Worker 连接超时 (${elapsed}ms)`))
            }, timeout)

            // 监听连接确认消息
            const connectionHandler = (event: MessageEvent) => {
                const { type } = event.data

                if (type === "CONNECTION_CONFIRMED") {
                    clearTimeout(timeoutId)
                    navigator.serviceWorker.removeEventListener("message", connectionHandler)
                    const elapsed = Date.now() - startTime
                    console.log(`[ResourceReaderPlugin] Service Worker 连接建立成功 (${elapsed}ms)`)
                    resolve()
                }
            }

            navigator.serviceWorker.addEventListener("message", connectionHandler)

            // 增强的Service Worker状态检查和连接逻辑
            const checkAndConnect = async (retryCount = 0) => {
                const maxRetries = 5 // 最多重试5次
                const retryDelay = 2000 * (retryCount + 1) // 递增延迟

                try {
                    console.log(`[ResourceReaderPlugin] 第${retryCount + 1}次检查Service Worker状态...`)
                    
                    const registration = await navigator.serviceWorker.ready
                    const sw = registration.active || registration.installing || registration.waiting
                    
                    if (sw) {
                        console.log(`[ResourceReaderPlugin] 找到Service Worker状态:`, {
                            active: !!registration.active,
                            installing: !!registration.installing, 
                            waiting: !!registration.waiting
                        })
                        
                        sw.postMessage({
                            type: "PING",
                            data: { timestamp: startTime, attempt: retryCount + 1 },
                        })
                    } else {
                        console.log(`[ResourceReaderPlugin] 当前没有可用的Service Worker，等待重试...`)
                        
                        if (retryCount < maxRetries) {
                            console.log(`[ResourceReaderPlugin] ${retryDelay}ms后进行第${retryCount + 2}次重试...`)
                            setTimeout(() => checkAndConnect(retryCount + 1), retryDelay)
                        } else {
                            clearTimeout(timeoutId)
                            navigator.serviceWorker.removeEventListener("message", connectionHandler)
                            
                            // 提供更详细的错误信息
                            const errorMsg = [
                                "Service Worker 激活失败",
                                `已重试${maxRetries}次`,
                                "可能的解决方案：",
                                "1. 确保在HTTPS或localhost环境下运行",
                                "2. 检查network-interceptor-sw.js文件是否存在",
                                "3. 确认浏览器支持Service Worker",
                                "4. 检查控制台是否有其他错误信息"
                            ].join("\n")
                            
                            reject(new Error(errorMsg))
                        }
                    }
                } catch (error) {
                    console.error(`[ResourceReaderPlugin] 第${retryCount + 1}次检查失败:`, error)
                    
                    if (retryCount < maxRetries) {
                        console.log(`[ResourceReaderPlugin] ${retryDelay}ms后进行第${retryCount + 2}次重试...`)
                        setTimeout(() => checkAndConnect(retryCount + 1), retryDelay)
                    } else {
                        clearTimeout(timeoutId)
                        navigator.serviceWorker.removeEventListener("message", connectionHandler)
                        reject(new Error(`Service Worker 连接失败: ${error instanceof Error ? error.message : String(error)}`))
                    }
                }
            }

            // 开始检查
            checkAndConnect()
        })
    }

    /**
     * Service Worker消息处理器引用（用于移除监听器）
     */
    private serviceWorkerMessageHandler: ((event: MessageEvent) => void) | null = null
    
    /**
     * 插件初始化
     */
    async init(): Promise<void> {
        // // 异步初始化KTX2Loader（需要renderer支持检测）
        // await this.initializeKTX2LoaderAsync()

        // // 监听资源释放事件
        // eventBus.on("resource:dispose", (url: string) => {
        //     this.disposeResource(url)
        // })

        // // 监听缓存清理事件
        // eventBus.on("resource:clearCache", () => {
        //     this.clearCache()
        // })

        // // 定时清理过期缓存
        // this.startCacheCleanup()
    }

    /**
     * 基类要求的load方法
     */
    async load(): Promise<void> {
        // 基类要求的方法，这里可以留空
    }

    /**
     * 异步加载GLTF/GLB模型 - 新的推荐方法
     * 添加了缓存检查功能，加载前先检查本地缓存
     */
    public async loadModelAsync(
        url: string,
        priority: TaskPriority = TaskPriority.NORMAL,
        options: {
            timeout?: number
            retryCount?: number
            category?: string
            metadata?: any
            forceReload?: boolean // 是否强制重新加载，忽略缓存
        } = {},
    ): Promise<THREE.Group | THREE.Scene | THREE.Object3D> {
        const fullUrl = this.resolveUrl(url)
        const forceReload = options.forceReload || false

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
            // 如果不强制重新加载，先检查缓存
            if (!forceReload) {
                const cachedModel = await this.getModelFromCache(fullUrl)
                if (cachedModel) {
                    console.log(`✅ 从缓存加载模型: ${fullUrl}`)
                    eventBus.emit("resource:loaded", {
                        url: fullUrl,
                        model: cachedModel,
                        loadTime: 0, // 缓存加载时间接近0
                        fromCache: true,
                    })

                    // 设置模型名称
                    this.setModelName(cachedModel, this.extractFileNameFromPath(fullUrl))

                    return cachedModel
                }
            }

            // 缓存中没有，调度网络加载任务
            console.log(`🔄 从网络加载模型: ${fullUrl}`)
            const result = await this.taskScheduler.schedule(taskConfig)
            if (result.success && result.data) {
                // 将加载的模型存入缓存
                await this.saveModelToCache(fullUrl, result.data, result.executionTime)

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

        this.gltfLoader.load(
            task.url,
            // onLoad
            (gltf: any) => {
                this.onLoadComplete(task, gltf)
            },
            // onProgress
            (progress: any) => {
                this.onLoadProgress(task, progress)
            },
            // onError
            (error: any) => {
                console.error(`❌ 模型加载失败: ${task.url}`, error)
                this.onLoadError(task, error as Error)
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

        // 执行回调，将处理后的模型放回gltf对象
        if (task.onComplete) {
            const enhancedGltf = { ...gltf, scene: processedModel }
            task.onComplete(enhancedGltf)
        }

        // 清理并处理下一个任务
        this.activeLoads.delete(task.id)

        const loadTime = Date.now() - task.startTime

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
    public getModelName(object: THREE.Group | THREE.Object3D): string {
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

    // 处理已加载的模型
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

    // 判断是否是建筑模型
    private isBuildingModel(fileName: string): boolean {
        // return fileName === 'MAIN_BUILDING'
        // 建筑模型的文件名必须包含MAIN_BUILDING，而且以MAIN_BUILDING结尾
        return fileName.includes("MAIN_BUILDING") && fileName.endsWith("MAIN_BUILDING")
    }

    // ==================== 缓存相关方法 ====================

    /**
     * 缓存管理器实例
     * 使用默认配置创建全局缓存管理器
     */
    private static cacheManager: GLTFModelCache | null = null

    /**
     * 获取或创建缓存管理器实例
     */
    private getCacheManager(): GLTFModelCache {
        if (!ResourceReaderPlugin.cacheManager) {
            // 创建全局缓存管理器实例
            ResourceReaderPlugin.cacheManager = new GLTFModelCache({
                databaseName: 'EngineKernel_GLTF_Cache',
                maxCacheSize: 500 * 1024 * 1024, // 500MB
                maxModels: 100,
                ttl: 7 * 24 * 60 * 60 * 1000, // 7天
                cleanupInterval: 60 * 60 * 1000 // 60分钟
            })
        }
        return ResourceReaderPlugin.cacheManager
    }

    /**
     * 从缓存中获取模型数据
     */
    private async getModelFromCache(url: string): Promise<THREE.Group | THREE.Scene | THREE.Object3D | null> {
        try {
            const cacheManager = this.getCacheManager()
            await cacheManager.initialize()

            // 通过URL查找缓存的模型数据
            const cachedData = await cacheManager.getModelByUrl(url)
            
            if (!cachedData) {
                return null
            }

            // 从序列化数据中恢复THREE对象
            const restoredModel = await this.restoreModelFromCacheData(cachedData)
            
            if (restoredModel) {
                console.log(`✅ 成功从缓存恢复模型: ${url}`)
                return restoredModel
            } else {
                console.warn(`⚠️ 缓存数据恢复失败: ${url}`)
                // 缓存数据可能损坏，删除它
                await cacheManager.deleteModel(cachedData.id)
                return null
            }
        } catch (error) {
            console.warn(`⚠️ 缓存读取失败: ${url}`, error)
            return null
        }
    }

    /**
     * 将模型数据保存到缓存
     */
    private async saveModelToCache(url: string, model: THREE.Group | THREE.Scene | THREE.Object3D, loadTime: number): Promise<void> {
        try {
            const cacheManager = this.getCacheManager()
            await cacheManager.initialize()

            // 生成缓存数据
            const cacheData = await this.generateCacheData(url, model, loadTime)

            if (cacheData) {
                // 保存到缓存
                await cacheManager.storeModel(url, cacheData.modelData)
                console.log(`💾 模型已缓存: ${url} (大小: ${this.formatFileSize(cacheData.metadata.estimatedSize)})`)
            }
        } catch (error) {
            console.warn(`⚠️ 缓存保存失败: ${url}`, error)
        }
    }

    /**
     * 生成模型的缓存数据
     */
    private async generateCacheData(
        url: string, 
        model: THREE.Group | THREE.Scene | THREE.Object3D,
        loadTime?: number
    ): Promise<GLTFModelCacheData | null> {
        try {
            // 获取文件扩展名
            const fileExt = this.extractFileExtFromUrl(url)
            const format = (fileExt.toLowerCase() === 'glb') ? 'glb' : 'gltf'

            // 提取模型信息
            const modelInfo = this.extractModelInfo(model)
            
            // 计算原始文件大小（估算）
            const estimatedSize = this.estimateModelSize(model)

            // 生成模型ID
            const modelId = this.generateCacheModelId(url)

            const cacheData: GLTFModelCacheData = {
                id: modelId,
                url: url,
                modelData: model, // 原始THREE对象
                metadata: {
                    cachedAt: Date.now(),
                    lastAccessed: Date.now(),
                    accessCount: 1,
                    estimatedSize: estimatedSize,
                    userAgent: navigator.userAgent
                }
            }

            return cacheData
        } catch (error) {
            console.warn(`⚠️ 缓存数据生成失败: ${url}`, error)
            return null
        }
    }

    /**
     * 提取模型信息
     */
    private extractModelInfo(model: THREE.Group | THREE.Scene | THREE.Object3D): { materials: string[], textures: string[], animations: string[] } {
        const materials: string[] = []
        const textures: string[] = []
        const animations: string[] = []

        try {
            // 递归遍历所有子对象
            model.traverse((child: any) => {
                // 收集材质信息
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((mat: any) => {
                            if (mat.name && !materials.includes(mat.name)) {
                                materials.push(mat.name)
                            }
                            // 收集贴图信息
                            if (mat.map) textures.push(mat.map.name || 'texture')
                            if (mat.normalMap) textures.push(mat.normalMap.name || 'normalMap')
                            if (mat.roughnessMap) textures.push(mat.roughnessMap.name || 'roughnessMap')
                            if (mat.metalnessMap) textures.push(mat.metalnessMap.name || 'metalnessMap')
                        })
                    } else {
                        const mat = child.material
                        if (mat.name && !materials.includes(mat.name)) {
                            materials.push(mat.name)
                        }
                        // 收集贴图信息
                        if (mat.map) textures.push(mat.map.name || 'texture')
                        if (mat.normalMap) textures.push(mat.normalMap.name || 'normalMap')
                        if (mat.roughnessMap) textures.push(mat.roughnessMap.name || 'roughnessMap')
                        if (mat.metalnessMap) textures.push(mat.metalnessMap.name || 'metalnessMap')
                    }
                }

                // 收集动画信息
                if (child.animations && child.animations.length > 0) {
                    child.animations.forEach((anim: any) => {
                        if (anim.name && !animations.includes(anim.name)) {
                            animations.push(anim.name)
                        }
                    })
                }
            })
        } catch (error) {
            console.warn('⚠️ 模型信息提取失败:', error)
        }

        return { materials, textures, animations }
    }

    /**
     * 估算模型大小
     */
    private estimateModelSize(model: THREE.Group | THREE.Scene | THREE.Object3D): number {
        let estimatedSize = 0

        try {
            // 基础对象大小
            estimatedSize += 1024 // 基础对象

            model.traverse((child: any) => {
                // 几何体大小估算
                if (child.geometry) {
                    const geometry = child.geometry
                    if (geometry.attributes && geometry.attributes.position) {
                        const positions = geometry.attributes.position
                        estimatedSize += positions.count * positions.itemSize * 4 // float32 = 4 bytes
                    }
                    if (geometry.attributes.normal) {
                        const normals = geometry.attributes.normal
                        estimatedSize += normals.count * normals.itemSize * 4
                    }
                    if (geometry.attributes.uv) {
                        const uvs = geometry.attributes.uv
                        estimatedSize += uvs.count * uvs.itemSize * 4
                    }
                }

                // 材质大小估算
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        estimatedSize += child.material.length * 2048 // 每个材质估算
                    } else {
                        estimatedSize += 2048 // 单个材质
                    }
                }

                // 贴图大小估算（假设每张贴图1MB）
                if (child.material && child.material.map) {
                    estimatedSize += 1024 * 1024
                }
            })
        } catch (error) {
            console.warn('⚠️ 模型大小估算失败:', error)
            estimatedSize = 1024 * 1024 // 默认1MB
        }

        return estimatedSize
    }

    /**
     * 从缓存数据中恢复THREE对象
     */
    private async restoreModelFromCacheData(cacheData: GLTFModelCacheData): Promise<THREE.Group | THREE.Scene | THREE.Object3D | null> {
        try {
            // 优先使用原始THREE对象数据
            if (cacheData.modelData) {
                return cacheData.modelData
            }

            // 如果原始对象不可用，返回null
            return null
        } catch (error) {
            console.warn('⚠️ 模型恢复失败:', error)
            return null
        }
    }

    /**
     * 序列化场景
     */
    private serializeScene(model: THREE.Group | THREE.Scene | THREE.Object3D): any {
        try {
            // 这里可以实现场景的序列化逻辑
            // 返回基本的模型信息用于备份
            return {
                type: model.type,
                name: model.name,
                userData: model.userData,
                children: model.children?.length || 0,
                serializedAt: Date.now()
            }
        } catch (error) {
            console.warn('⚠️ 场景序列化失败:', error)
            return null
        }
    }

    /**
     * 生成缓存模型ID
     */
    private generateCacheModelId(url: string): string {
        // 使用URL生成简单的哈希ID
        const str = url.replace(/[^a-zA-Z0-9]/g, '')
        return `cache_${str}_${Date.now()}`
    }

    /**
     * 从URL提取文件扩展名
     */
    private extractFileExtFromUrl(url: string): string {
        const cleanUrl = url.split('?')[0] // 移除查询参数
        const lastDot = cleanUrl.lastIndexOf('.')
        if (lastDot === -1) return ''
        return cleanUrl.substring(lastDot + 1)
    }

    /**
     * 格式化文件大小显示
     */
    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes'
        
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    /**
     * 清理过期缓存
     */
    public async cleanupExpiredCache(): Promise<number> {
        try {
            const cacheManager = this.getCacheManager()
            await cacheManager.initialize()
            
            const cleanedCount = await cacheManager.cleanupExpired()
            console.log(`🧹 缓存清理完成，删除了${cleanedCount}个过期项`)
            return cleanedCount
        } catch (error) {
            console.warn('⚠️ 缓存清理失败:', error)
            return 0
        }
    }

    /**
     * 获取缓存统计信息
     */
    public async getCacheStatistics(): Promise<CacheStatistics | null> {
        try {
            const cacheManager = this.getCacheManager()
            await cacheManager.initialize()
            
            return await cacheManager.getStatistics()
        } catch (error) {
            console.warn('⚠️ 缓存统计获取失败:', error)
            return null
        }
    }

    /**
     * 清空所有缓存
     */
    public async clearAllCache(): Promise<boolean> {
        try {
            const cacheManager = this.getCacheManager()
            await cacheManager.initialize()
            
            await cacheManager.clearAll()
            console.log('🗑️ 所有缓存已清空')
            return true
        } catch (error) {
            console.warn('⚠️ 缓存清空失败:', error)
            return false
        }
    }

    /**
     * 从缓存中删除特定模型
     */
    public async removeModelFromCache(url: string): Promise<boolean> {
        try {
            const cacheManager = this.getCacheManager()
            await cacheManager.initialize()
            
            // 首先通过URL查找缓存数据获取ID
            const cachedData = await cacheManager.getModelByUrl(url)
            if (!cachedData) {
                console.log(`ℹ️ 缓存中未找到模型: ${url}`)
                return false
            }
            
            const success = await cacheManager.deleteModel(cachedData.id)
            if (success) {
                console.log(`🗑️ 缓存模型已删除: ${url}`)
            } else {
                console.warn(`⚠️ 删除缓存模型失败: ${url}`)
            }
            return success
        } catch (error) {
            console.warn(`⚠️ 删除缓存模型失败: ${url}`, error)
            return false
        }
    }


}
