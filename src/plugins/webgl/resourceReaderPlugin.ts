// 增强后的资源读取插件
import { BasePlugin } from "../basePlugin"
import * as THREE from "three"
import eventBus from '../../eventBus/eventBus'
// 从统一的模块管理文件导入 GLTFLoader
import { GLTFLoader } from "../../utils/threeModules"


// // 加载path底下所有的文件，以文件名为key，文件路径为value，返回一个对象。 这个path是一个文件目录路径
// const getResource = async (basePath: string) => {
//     try {
//         const response = await fetch(`${basePath}`, {
//             headers: { 'Accept': 'application/json' }
//         });
//         if (!response.ok) throw new Error(`目录请求失败: ${response.status}`);
//         const contentType = response.headers.get('Content-Type');
//         if (!contentType?.includes('application/json')) {
//             const text = await response.text();
//             throw new Error(`无效的响应类型: ${contentType} - 响应内容: ${text.substring(0, 100)}`);
//         }
//         const entries = await response.json();
//         console.log("🚀 ~ getResource ~ entries:", entries)

//         const fileMap: { [key: string]: string } = {};
//         const processEntry = async (entry: any) => {
//             const entryPath = `${basePath}/${encodeURIComponent(entry.name)}`;
//             if (entry.type === 'directory') {
//                 const subFiles = await getResource(entryPath);
//                 console.log(subFiles,"subfiles")
//                 Object.assign(fileMap, subFiles);
//             } else if (entry.type === 'file') {
//                 fileMap[entry.name] = entryPath;
//                 eventBus.emit('FILE_FOUND', { name: entry.name, path: entryPath });
//             }
//         };
//         await Promise.all(entries.map(processEntry));
//         console.log(`资源加载完成: ${basePath}`, fileMap);
//         return fileMap;
//     } catch (error) {
//         console.error(`资源加载失败: ${basePath}`, error);
//         eventBus.emit('LOAD_ERROR', error);
//         throw error;
//     }
// };

// const validateResourcePath = (path: string) => {
//     if (!path || !/^[\w\-/.:]+$/.test(path) || path.endsWith('.html')) {
//         throw new Error(`Invalid resource path: ${path}`);
//     }
//     return path;
// };

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
    // private baseUrl: string = ""
    // private loadTaskQueue: Map<string, LoadTask> = new Map()
    // private resourceCache: Map<string, any> = new Map()
    // private loadersMap: Map<ResourceType, any> = new Map()
    
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
        // this.url = meta?.userData?.url || "";
        // validateResourcePath(this.url);
        // this.gltfLoader = new GLTFLoader()
        // this.loadFromDirectory(this.url)
    }

    // // 从目录加载资源
    // async loadFromDirectory(dirPath: string) {
    //     try {
    //         eventBus.emit('DIR_SCAN_START', { path: dirPath });
    //         const fileMap = await getResource(dirPath);
            
    //         const tasks = Object.entries(fileMap).map(([fileName, filePath]) => {
    //             const fileType = this.getFileType(fileName);
    //             return this.loadResource(filePath as string, fileType);
    //         });

    //         await Promise.all(tasks);
    //         eventBus.emit('DIR_SCAN_COMPLETE', {
    //             path: dirPath,
    //             totalFiles: Object.keys(fileMap).length
    //         });
    //     } catch (error) {
    //         console.error('目录加载失败:', error);
    //         eventBus.emit('LOAD_ERROR', error);
    //     }
    // }

    // /**
    //  * 初始化插件配置
    //  */
    // private initializePlugin(meta: any): void {
    //     const userData = meta?.userData || {}
    //     this.baseUrl = userData.url || "/public"
    //     this.maxConcurrentTasks = userData.maxConcurrent || 4
        
    //     // 验证基础 URL
    //     if (!this.baseUrl) {
    //         throw new Error('资源基础路径不能为空')
    //     }
    // }

    // /**
    //  * 初始化各种加载器
    //  */
    // private initializeLoaders(): void {
    //     this.loadersMap.set(ResourceType.GLTF, new GLTFLoader())
    //     this.loadersMap.set(ResourceType.TEXTURE, new THREE.TextureLoader())
    //     // 其他加载器可以后续添加
    // }

    // /**
    //  * 设置事件监听器
    //  */
    // private setupEventListeners(): void {
    //     eventBus.on('load-resource', this.handleResourceLoadRequest.bind(this))
    //     eventBus.on('load-resource-list', this.handleResourceListLoadRequest.bind(this))
    // }

    // /**
    //  * 处理单个资源加载请求
    //  */
    // private handleResourceLoadRequest(resourceConfig: ResourceConfig): void {
    //     try {
    //         this.loadResource(resourceConfig)
    //     } catch (error) {
    //         console.error('处理资源加载请求失败:', error)
    //     }
    // }

    // /**
    //  * 处理资源列表加载请求
    //  */
    // private handleResourceListLoadRequest(resourceList: ResourceConfig[]): void {
    //     try {
    //         this.loadResourceList(resourceList)
    //     } catch (error) {
    //         console.error('处理资源列表加载请求失败:', error)
    //     }
    // }

    // private async loadResource(filePath: string, fileType: string) {
    //     if (this.cache.has(filePath)) {
    //         const cachedResponse = await caches.open('my-cache').then(cache => cache.match(filePath));
    //         if (cachedResponse) {
    //             const contentType = cachedResponse.headers.get('Content-Type');
    //             if (contentType && contentType.includes('application/json')) {
    //                 return cachedResponse.json();
    //             }
    //         }
    //     }
    //     const response = await fetch(filePath);
    //     if (!response.ok) {
    //         throw new Error(`Failed to fetch resource: ${response.statusText}`);
    //     }

    //     // 新增响应内容预检
    //     const contentType = response.headers.get('Content-Type');
    //     if (!contentType || !contentType.includes('application/json')) {
    //         const text = await response.text();
    //         if (text.startsWith('<')) {
    //             throw new Error(`HTML content detected: ${text.substring(0, 100)}...`);
    //         }
    //         throw new Error(`Invalid content type: ${contentType}`);
    //     }

    //     // 验证JSON格式有效性
    //     const rawData = await response.text();
    //     try {
    //         JSON.parse(rawData);
    //     } catch (e) {
    //         throw new Error(`Invalid JSON format: ${rawData.substring(0, 100)}...`);
    //     }
    //     const fileList = JSON.parse(rawData);
    //     const blob = await response.blob();
    //     const objectURL = URL.createObjectURL(blob);
    //     return new Promise((resolve, reject) => {
    //         switch (fileType) {
    //             case 'gltf':
    //                 this.gltfLoader.load(objectURL, (gltf) => {
    //                     eventBus.emit('GLTF_READY', { asset: gltf, path: filePath });
    //                     resolve({ ...gltf, path: filePath });
    //                 }, undefined, (error) => {
    //                     eventBus.emit('LOAD_ERROR', error);
    //                     reject(error);
    //                 });
    //                 break;
    //             case 'texture':
    //                 const textureLoader = new THREE.TextureLoader();
    //                 textureLoader.load(objectURL, (texture) => {
    //                     eventBus.emit('TEXTURE_READY', { asset: texture, path: filePath });
    //                     resolve({ texture, path: filePath });
    //                 }, undefined, (error) => {
    //                     eventBus.emit('LOAD_ERROR', error);
    //                     reject(error);
    //                 });
    //                 break;
    //             case 'skybox':
    //                 const cubeTextureLoader = new THREE.CubeTextureLoader();
    //                 cubeTextureLoader.load([filePath], (cubeTexture) => {
    //                     eventBus.emit('SKYBOX_READY', { asset: cubeTexture, path: filePath });
    //                     resolve({ ...cubeTexture, path: filePath });
    //                 }, undefined, (error) => {
    //                     eventBus.emit('LOAD_ERROR', error);
    //                     reject(error);
    //                 });
    //                 break;
    //             default:
    //                 reject(new Error(`不支持的资源类型: ${config.type}`))
    //         }
    //     })
    // }

    // /**
    //  * 加载 GLTF 模型
    //  */
    // private loadGltfResource(
    //     path: string, 
    //     name: string, 
    //     startTime: number,
    //     resolve: Function, 
    //     reject: Function
    // ): void {
    //     const loader = this.loadersMap.get(ResourceType.GLTF)
        
    //     loader.load(
    //         path,
    //         (gltf: any) => {
    //             const result = this.createLoadResult(name, ResourceType.GLTF, gltf, startTime)
    //             this.handleLoadSuccess(result, resolve)
    //         },
    //         (progress: any) => {
    //             eventBus.emit('resource-progress', { name, progress })
    //         },
    //         (error: any) => {
    //             this.handleLoadError(name, error, reject)
    //         }
    //     )
    // }

    // /**
    //  * 加载纹理资源
    //  */
    // private loadTextureResource(
    //     path: string, 
    //     name: string, 
    //     startTime: number,
    //     resolve: Function, 
    //     reject: Function
    // ): void {
    //     const loader = this.loadersMap.get(ResourceType.TEXTURE)
        
    //     loader.load(
    //         path,
    //         (texture: THREE.Texture) => {
    //             const result = this.createLoadResult(name, ResourceType.TEXTURE, texture, startTime)
    //             this.handleLoadSuccess(result, resolve)
    //         },
    //         (progress: any) => {
    //             eventBus.emit('resource-progress', { name, progress })
    //         },
    //         (error: any) => {
    //             this.handleLoadError(name, error, reject)
    //         }
    //     )
    // }

    // /**
    //  * 加载文本资源
    //  */
    // private loadTextResource(
    //     path: string, 
    //     name: string, 
    //     startTime: number,
    //     resolve: Function, 
    //     reject: Function
    // ): void {
    //     fetch(path)
    //         .then(response => {
    //             if (!response.ok) {
    //                 throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    //             }
    //             return response.text()
    //         })
    //         .then(text => {
    //             const result = this.createLoadResult(name, ResourceType.TEXT, text, startTime)
    //             this.handleLoadSuccess(result, resolve)
    //         })
    //         .catch(error => {
    //             this.handleLoadError(name, error, reject)
    //         })
    // }

    // /**
    //  * 加载脚本资源
    //  */
    // private loadScriptResource(
    //     path: string, 
    //     name: string, 
    //     startTime: number,
    //     resolve: Function, 
    //     reject: Function
    // ): void {
    //     const script = document.createElement('script')
    //     script.src = path
    //     script.onload = () => {
    //         const result = this.createLoadResult(name, ResourceType.SCRIPT, script, startTime)
    //         this.handleLoadSuccess(result, resolve)
    //     }
    //     script.onerror = (error) => {
    //         this.handleLoadError(name, error, reject)
    //     }
    //     document.head.appendChild(script)
    // }

    // /**
    //  * 处理加载成功
    //  */
    // private handleLoadSuccess(result: LoadResult, resolve: Function): void {
    //     // 添加到缓存
    //     this.resourceCache.set(result.name, result)
        
    //     // 更新统计
    //     this.completedTaskCount++
    //     this.activeTaskCount--
        
    //     // 发送事件
    //     eventBus.emit('resource-loaded', result)
    //     eventBus.emit('resource-progress-update', {
    //         total: this.totalTaskCount,
    //         completed: this.completedTaskCount,
    //         failed: this.failedTaskCount
    //     })
        
    //     // 继续处理队列
    //     this.processTaskQueue()
        
    //     resolve(result)
    // }

    // /**
    //  * 处理加载失败
    //  */
    // private handleLoadError(name: string, error: any, reject: Function): void {
    //     this.failedTaskCount++
    //     this.activeTaskCount--
        
    //     const errorMessage = `加载资源 "${name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`
    //     console.error(errorMessage, error)
        
    //     eventBus.emit('resource-load-error', { name, error: errorMessage })
    //     eventBus.emit('resource-progress-update', {
    //         total: this.totalTaskCount,
    //         completed: this.completedTaskCount,
    //         failed: this.failedTaskCount
    //     })
        
    //     // 继续处理队列
    //     this.processTaskQueue()
        
    //     reject(new Error(errorMessage))
    // }

    // /**
    //  * 创建加载结果对象
    //  */
    // private createLoadResult(name: string, type: ResourceType, data: any, startTime: number): LoadResult {
    //     return {
    //         name,
    //         type,
    //         data,
    //         loadTime: Date.now() - startTime
    //     }
    // }

    // /**
    //  * 处理任务队列
    //  */
    // private async processTaskQueue(): Promise<void> {
    //     if (this.isProcessingQueue || this.activeTaskCount >= this.maxConcurrentTasks) {
    //         return
    //     }

    //     this.isProcessingQueue = true

    //     // 按优先级排序任务
    //     const pendingTasks = Array.from(this.loadTaskQueue.values())
    //         .filter(task => task.status === 'pending')
    //         .sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0))

    //     const availableSlots = this.maxConcurrentTasks - this.activeTaskCount
    //     const tasksToStart = pendingTasks.slice(0, availableSlots)

    //     for (const task of tasksToStart) {
    //         task.status = 'loading'
    //         this.activeTaskCount++
            
    //         try {
    //             await task.promise
    //             task.status = 'completed'
    //         } catch (error) {
    //             task.status = 'failed'
    //         } finally {
    //             this.loadTaskQueue.delete(task.id)
    //         }
    //     }

    //     this.isProcessingQueue = false

    //     // 如果还有待处理任务，继续处理
    //     if (this.activeTaskCount < this.maxConcurrentTasks && this.hasPendingTasks()) {
    //         setTimeout(() => this.processTaskQueue(), 10)
    //     }
    // }

    // /**
    //  * 检查是否有待处理任务
    //  */
    // private hasPendingTasks(): boolean {
    //     return Array.from(this.loadTaskQueue.values()).some(task => task.status === 'pending')
    // }

    // /**
    //  * 生成任务 ID
    //  */
    // private generateTaskId(config: ResourceConfig): string {
    //     return `${config.name}_${config.type}_${config.path}`
    // }

    // /**
    //  * 构建完整资源路径
    //  */
    // private buildResourcePath(relativePath: string): string {
    //     // 确保路径格式正确
    //     const cleanBasePath = this.baseUrl.replace(/\/$/, '')
    //     const cleanRelativePath = relativePath.replace(/^\//, '')
    //     return `${cleanBasePath}/${cleanRelativePath}`
    // }

    // /**
    //  * 获取缓存的资源
    //  */
    // public getCachedResource(name: string): LoadResult | null {
    //     return this.resourceCache.get(name) || null
    // }

    // /**
    //  * 清理缓存
    //  */
    // public clearCache(): void {
    //     this.resourceCache.clear()
    //     eventBus.emit('resource-cache-cleared')
    // }

    // /**
    //  * 获取加载统计信息
    //  */
    // public getLoadStats() {
    //     return {
    //         total: this.totalTaskCount,
    //         completed: this.completedTaskCount,
    //         failed: this.failedTaskCount,
    //         pending: this.loadTaskQueue.size,
    //         active: this.activeTaskCount
    //     }
    // }

    // /**
    //  * 公开 gltfLoader 供其他地方使用（保持向后兼容）
    //  */
    // public get gltfLoader(): GLTFLoader {
    //     return this.loadersMap.get(ResourceType.GLTF)
    // }

    // /**
    //  * 销毁插件
    //  */
    // destroy(): void {
    //     // 清理事件监听器
    //     eventBus.off('load-resource', this.handleResourceLoadRequest)
    //     eventBus.off('load-resource-list', this.handleResourceListLoadRequest)
        
    //     // 清理缓存和队列
    //     this.resourceCache.clear()
    //     this.loadTaskQueue.clear()
        
    //     // 清理加载器
    //     this.loadersMap.clear()
    // }

    // update(): void {
    //     // 插件更新逻辑（如果需要）
    // }
}
