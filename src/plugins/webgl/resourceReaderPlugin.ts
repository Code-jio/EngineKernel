// 增强后的资源读取插件
import { THREE, BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"

// 支持的文件类型枚举
enum ResourceType {
    GLTF = 'gltf',
    TEXTURE = 'texture', 
    SKYBOX = 'skybox',
    TEXT = 'text',
    SCRIPT = 'script'
}

// 资源配置接口
interface ResourceConfig {
    name: string
    path: string
    type: ResourceType
    priority?: number
}

// 加载任务接口
interface LoadTask {
    id: string
    config: ResourceConfig
    promise: Promise<any>
    status: 'pending' | 'loading' | 'completed' | 'failed'
}

// 加载结果接口
interface LoadResult {
    name: string
    type: ResourceType
    data: any
    loadTime: number
}

/**
 * 资源读取插件
 * 功能要求：
 * 1. 实现资源读取的异步任务队列（防止线程阻塞）
 * 2. 支持多种资源类型的加载
 * 3. 提供缓存管理
 * 4. 通过 eventBus 发布加载事件
 * 5. 支持优先级队列和并发控制
 */
export class ResourceReaderPlugin extends BasePlugin {
    private baseUrl: string = ""
    private loadTaskQueue: Map<string, LoadTask> = new Map()
    private resourceCache: Map<string, any> = new Map()
    private loadersMap: Map<ResourceType, any> = new Map()
    
    // 队列控制参数
    private maxConcurrentTasks = 4
    private activeTaskCount = 0
    private isProcessingQueue = false
    
    // 统计信息
    private totalTaskCount = 0
    private completedTaskCount = 0
    private failedTaskCount = 0

    constructor(meta: any) {
        super(meta)
        
        try {
            this.initializePlugin(meta)
            this.initializeLoaders()
            this.setupEventListeners()
        } catch (error) {
            console.error('ResourceReaderPlugin 初始化失败:', error)
            throw new Error(`资源读取插件初始化错误: ${error instanceof Error ? error.message : '未知错误'}`)
        }
    }

    /**
     * 初始化插件配置
     */
    private initializePlugin(meta: any): void {
        const userData = meta?.userData || {}
        this.baseUrl = userData.url || "/public"
        this.maxConcurrentTasks = userData.maxConcurrent || 4
        
        // 验证基础 URL
        if (!this.baseUrl) {
            throw new Error('资源基础路径不能为空')
        }
    }

    /**
     * 初始化各种加载器
     */
    private initializeLoaders(): void {
        this.loadersMap.set(ResourceType.GLTF, new GLTFLoader())
        this.loadersMap.set(ResourceType.TEXTURE, new THREE.TextureLoader())
        // 其他加载器可以后续添加
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        eventBus.on('load-resource', this.handleResourceLoadRequest.bind(this))
        eventBus.on('load-resource-list', this.handleResourceListLoadRequest.bind(this))
    }

    /**
     * 处理单个资源加载请求
     */
    private handleResourceLoadRequest(resourceConfig: ResourceConfig): void {
        try {
            this.loadResource(resourceConfig)
        } catch (error) {
            console.error('处理资源加载请求失败:', error)
        }
    }

    /**
     * 处理资源列表加载请求
     */
    private handleResourceListLoadRequest(resourceList: ResourceConfig[]): void {
        try {
            this.loadResourceList(resourceList)
        } catch (error) {
            console.error('处理资源列表加载请求失败:', error)
        }
    }

    /**
     * 加载单个资源
     */
    public loadResource(config: ResourceConfig): Promise<LoadResult> {
        const taskId = this.generateTaskId(config)
        
        // 检查缓存
        if (this.resourceCache.has(taskId)) {
            const cachedResult = this.resourceCache.get(taskId)
            eventBus.emit('resource-loaded', cachedResult)
            return Promise.resolve(cachedResult)
        }

        // 检查是否已在队列中
        if (this.loadTaskQueue.has(taskId)) {
            return this.loadTaskQueue.get(taskId)!.promise
        }

        // 创建加载任务
        const loadPromise = this.createLoadTask(config)
        const task: LoadTask = {
            id: taskId,
            config,
            promise: loadPromise,
            status: 'pending'
        }

        this.loadTaskQueue.set(taskId, task)
        this.totalTaskCount++
        
        // 开始处理队列
        this.processTaskQueue()
        
        return loadPromise
    }

    /**
     * 批量加载资源
     */
    public loadResourceList(resourceList: ResourceConfig[]): Promise<LoadResult[]> {
        const loadPromises = resourceList.map(config => this.loadResource(config))
        return Promise.all(loadPromises)
    }

    /**
     * 创建加载任务
     */
    private createLoadTask(config: ResourceConfig): Promise<LoadResult> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now()
            const fullPath = this.buildResourcePath(config.path)
            
            switch (config.type) {
                case ResourceType.GLTF:
                    this.loadGltfResource(fullPath, config.name, startTime, resolve, reject)
                    break
                case ResourceType.TEXTURE:
                    this.loadTextureResource(fullPath, config.name, startTime, resolve, reject)
                    break
                case ResourceType.TEXT:
                    this.loadTextResource(fullPath, config.name, startTime, resolve, reject)
                    break
                case ResourceType.SCRIPT:
                    this.loadScriptResource(fullPath, config.name, startTime, resolve, reject)
                    break
                default:
                    reject(new Error(`不支持的资源类型: ${config.type}`))
            }
        })
    }

    /**
     * 加载 GLTF 模型
     */
    private loadGltfResource(
        path: string, 
        name: string, 
        startTime: number,
        resolve: Function, 
        reject: Function
    ): void {
        const loader = this.loadersMap.get(ResourceType.GLTF)
        
        loader.load(
            path,
            (gltf: any) => {
                const result = this.createLoadResult(name, ResourceType.GLTF, gltf, startTime)
                this.handleLoadSuccess(result, resolve)
            },
            (progress: any) => {
                eventBus.emit('resource-progress', { name, progress })
            },
            (error: any) => {
                this.handleLoadError(name, error, reject)
            }
        )
    }

    /**
     * 加载纹理资源
     */
    private loadTextureResource(
        path: string, 
        name: string, 
        startTime: number,
        resolve: Function, 
        reject: Function
    ): void {
        const loader = this.loadersMap.get(ResourceType.TEXTURE)
        
        loader.load(
            path,
            (texture: THREE.Texture) => {
                const result = this.createLoadResult(name, ResourceType.TEXTURE, texture, startTime)
                this.handleLoadSuccess(result, resolve)
            },
            (progress: any) => {
                eventBus.emit('resource-progress', { name, progress })
            },
            (error: any) => {
                this.handleLoadError(name, error, reject)
            }
        )
    }

    /**
     * 加载文本资源
     */
    private loadTextResource(
        path: string, 
        name: string, 
        startTime: number,
        resolve: Function, 
        reject: Function
    ): void {
        fetch(path)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }
                return response.text()
            })
            .then(text => {
                const result = this.createLoadResult(name, ResourceType.TEXT, text, startTime)
                this.handleLoadSuccess(result, resolve)
            })
            .catch(error => {
                this.handleLoadError(name, error, reject)
            })
    }

    /**
     * 加载脚本资源
     */
    private loadScriptResource(
        path: string, 
        name: string, 
        startTime: number,
        resolve: Function, 
        reject: Function
    ): void {
        const script = document.createElement('script')
        script.src = path
        script.onload = () => {
            const result = this.createLoadResult(name, ResourceType.SCRIPT, script, startTime)
            this.handleLoadSuccess(result, resolve)
        }
        script.onerror = (error) => {
            this.handleLoadError(name, error, reject)
        }
        document.head.appendChild(script)
    }

    /**
     * 处理加载成功
     */
    private handleLoadSuccess(result: LoadResult, resolve: Function): void {
        // 添加到缓存
        this.resourceCache.set(result.name, result)
        
        // 更新统计
        this.completedTaskCount++
        this.activeTaskCount--
        
        // 发送事件
        eventBus.emit('resource-loaded', result)
        eventBus.emit('resource-progress-update', {
            total: this.totalTaskCount,
            completed: this.completedTaskCount,
            failed: this.failedTaskCount
        })
        
        // 继续处理队列
        this.processTaskQueue()
        
        resolve(result)
    }

    /**
     * 处理加载失败
     */
    private handleLoadError(name: string, error: any, reject: Function): void {
        this.failedTaskCount++
        this.activeTaskCount--
        
        const errorMessage = `加载资源 "${name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`
        console.error(errorMessage, error)
        
        eventBus.emit('resource-load-error', { name, error: errorMessage })
        eventBus.emit('resource-progress-update', {
            total: this.totalTaskCount,
            completed: this.completedTaskCount,
            failed: this.failedTaskCount
        })
        
        // 继续处理队列
        this.processTaskQueue()
        
        reject(new Error(errorMessage))
    }

    /**
     * 创建加载结果对象
     */
    private createLoadResult(name: string, type: ResourceType, data: any, startTime: number): LoadResult {
        return {
            name,
            type,
            data,
            loadTime: Date.now() - startTime
        }
    }

    /**
     * 处理任务队列
     */
    private async processTaskQueue(): Promise<void> {
        if (this.isProcessingQueue || this.activeTaskCount >= this.maxConcurrentTasks) {
            return
        }

        this.isProcessingQueue = true

        // 按优先级排序任务
        const pendingTasks = Array.from(this.loadTaskQueue.values())
            .filter(task => task.status === 'pending')
            .sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0))

        const availableSlots = this.maxConcurrentTasks - this.activeTaskCount
        const tasksToStart = pendingTasks.slice(0, availableSlots)

        for (const task of tasksToStart) {
            task.status = 'loading'
            this.activeTaskCount++
            
            try {
                await task.promise
                task.status = 'completed'
            } catch (error) {
                task.status = 'failed'
            } finally {
                this.loadTaskQueue.delete(task.id)
            }
        }

        this.isProcessingQueue = false

        // 如果还有待处理任务，继续处理
        if (this.activeTaskCount < this.maxConcurrentTasks && this.hasPendingTasks()) {
            setTimeout(() => this.processTaskQueue(), 10)
        }
    }

    /**
     * 检查是否有待处理任务
     */
    private hasPendingTasks(): boolean {
        return Array.from(this.loadTaskQueue.values()).some(task => task.status === 'pending')
    }

    /**
     * 生成任务 ID
     */
    private generateTaskId(config: ResourceConfig): string {
        return `${config.name}_${config.type}_${config.path}`
    }

    /**
     * 构建完整资源路径
     */
    private buildResourcePath(relativePath: string): string {
        // 确保路径格式正确
        const cleanBasePath = this.baseUrl.replace(/\/$/, '')
        const cleanRelativePath = relativePath.replace(/^\//, '')
        return `${cleanBasePath}/${cleanRelativePath}`
    }

    /**
     * 获取缓存的资源
     */
    public getCachedResource(name: string): LoadResult | null {
        return this.resourceCache.get(name) || null
    }

    /**
     * 清理缓存
     */
    public clearCache(): void {
        this.resourceCache.clear()
        eventBus.emit('resource-cache-cleared')
    }

    /**
     * 获取加载统计信息
     */
    public getLoadStats() {
        return {
            total: this.totalTaskCount,
            completed: this.completedTaskCount,
            failed: this.failedTaskCount,
            pending: this.loadTaskQueue.size,
            active: this.activeTaskCount
        }
    }

    /**
     * 公开 gltfLoader 供其他地方使用（保持向后兼容）
     */
    public get gltfLoader(): GLTFLoader {
        return this.loadersMap.get(ResourceType.GLTF)
    }

    /**
     * 销毁插件
     */
    destroy(): void {
        // 清理事件监听器
        eventBus.off('load-resource', this.handleResourceLoadRequest)
        eventBus.off('load-resource-list', this.handleResourceListLoadRequest)
        
        // 清理缓存和队列
        this.resourceCache.clear()
        this.loadTaskQueue.clear()
        
        // 清理加载器
        this.loadersMap.clear()
    }

    update(): void {
        // 插件更新逻辑（如果需要）
    }
}
