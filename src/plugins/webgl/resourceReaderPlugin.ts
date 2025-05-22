// 增强后的资源读取插件
import { BasePlugin } from "../basePlugin"
import * as THREE from "three"
import eventBus from '../../eventBus/eventBus'
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"

/**
 * 预期功能要求：
 * 1.实现资源读取的异步任务队列（防止线程阻塞）
 * 2.使用serviceWorker完成资源缓存管理
 * 3.参数输入仅给一个文件路径，根据该文件路径下各个文件夹名称不同（例如：模型、天空盒、地图等），分成各个不同的加载任务，形成一个加载队列
 * 4.加载队列中的任务完成后，将加载的资源通过eventBus进行发布，在主文件中进行订阅，进行资源的加载
 * 5.后续还会涉及到天空盒、地图数据的加载，需要对资源读取插件进行扩展
 */

export class ResourceReaderPlugin extends BasePlugin {
    private url: string = "" // 资源文件路径(主文件入口)
    private taskQueue: Map<string, Promise<any>> = new Map()
    private gltfLoader: GLTFLoader = new GLTFLoader() // 后续不仅仅是涉及模型的加载，还会涉及到天空盒、地图数据的加载
    private totalTasks = 0
    private maxConcurrent = 4
    private activeTasks = 0
    private cache = new Map<string, any>()
    private serviceWorker: ServiceWorker | null = null

    constructor(meta: any) {
        super(meta)
        this.url = meta?.userData?.url || "/public";
        this.validateResourcePath(this.url);
        this.registerServiceWorker();
        this.loadFromDirectory(this.url);
    }

    // 注册ServiceWorker进行资源缓存管理
    private async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/'
                });
                this.serviceWorker = registration.active;
                console.log('ServiceWorker 注册成功:', registration.scope);
                
                // 监听来自ServiceWorker的消息
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data.type === 'CACHE_COMPLETE') {
                        console.log('缓存完成:', event.data.url);
                    }
                });
            } catch (error) {
                console.error('ServiceWorker 注册失败:', error);
            }
        }
    }

    // 验证资源路径
    private validateResourcePath(path: string): string {
        if (!path) {
            throw new Error('资源路径不能为空');
        }
        return path;
    }

    // 从目录加载资源
    async loadFromDirectory(dirPath: string) {
        try {
            const directoryStructure = await this.fetchResource(dirPath);
            
            // 根据不同类型的文件夹创建不同的加载任务
            for (const folderName in directoryStructure) {
                const folderPath = `${dirPath}/${folderName}`;
                const fileList = directoryStructure[folderName];
                
                // 根据文件夹名称确定资源类型
                let resourceType: string;
                switch (folderName.toLowerCase()) {
                    case 'models':
                    case 'model':
                        resourceType = 'model';
                        break;
                    case 'textures':
                    case 'texture':
                        resourceType = 'texture';
                        break;
                    case 'skybox':
                    case 'skyboxes':
                        resourceType = 'skybox';
                        break;
                    case 'maps':
                    case 'map':
                        resourceType = 'map';
                        break;
                    default:
                        resourceType = this.detectResourceTypeFromExtension(folderName);
                }
                
                // 为该文件夹中的每个文件创建加载任务
                if (Array.isArray(fileList)) {
                    fileList.forEach((file: string) => {
                        const filePath = `${folderPath}/${file}`;
                        const fileType = this.getFileType(file);
                        // 将任务添加到队列
                        this.addTask(
                            `${resourceType}_${file}`, 
                            () => this.loadResource(filePath, fileType, resourceType)
                        );
                    });
                }
            }
            
            // 开始处理队列
            await this.processQueue();
            
            // 通知加载完成
            eventBus.emit('RESOURCES_LOAD_COMPLETE', {
                totalLoaded: this.totalTasks
            });
        } catch (error) {
            console.error('加载目录失败:', error);
            eventBus.emit('LOAD_ERROR', error);
        }
    }

    // 从文件扩展名推断资源类型
    private detectResourceTypeFromExtension(fileName: string): string {
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        
        if (['gltf', 'glb', 'obj', 'fbx'].includes(extension)) {
            return 'model';
        } else if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(extension)) {
            return 'texture';
        } else if (['hdr', 'dds', 'env'].includes(extension)) {
            return 'skybox';
        } else if (['json', 'geojson', 'topojson'].includes(extension)) {
            return 'map';
        }
        
        return 'unknown';
    }

    // 获取文件类型
    private getFileType(file: string): string {
        const extension = file.split('.').pop()?.toLowerCase() || '';
        
        switch (extension) {
            case 'gltf':
            case 'glb':
                return 'gltf';
            case 'obj':
                return 'obj';
            case 'fbx':
                return 'fbx';
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'webp':
            case 'bmp':
                return 'texture';
            case 'hdr':
            case 'dds':
            case 'env':
                return 'skybox';
            case 'json':
            case 'geojson':
            case 'topojson':
                return 'map';
            case 'md':
            case 'txt':
                return 'text';
            case 'js':
            case 'ts':
                return 'script';
            default:
                return 'unknown';
        }
    }

    // 添加任务到队列
    private addTask(taskId: string, task: () => Promise<any>) {
        if (!this.taskQueue.has(taskId)) {
            this.taskQueue.set(taskId, task());
            this.totalTasks++;
            this.processQueue();
        }
    }

    // 处理任务队列
    private async processQueue() {
        if (this.taskQueue.size === 0 || this.activeTasks >= this.maxConcurrent) {
            return;
        }
        
        // 获取任务队列中的下一个任务
        const entries = Array.from(this.taskQueue.entries());
        if (entries.length === 0) return;
        
        const [taskId, taskPromise] = entries[0];
        this.taskQueue.delete(taskId);
        this.activeTasks++;
        
        try {
            // 执行任务
            const result = await taskPromise;
            
            // 任务成功完成后缓存结果
            if (result) {
                this.cache.set(taskId, result);
                
                // 发出加载进度事件
                const progress = (this.totalTasks - this.taskQueue.size) / this.totalTasks;
                eventBus.emit('RESOURCE_LOAD_PROGRESS', {
                    taskId,
                    progress,
                    result
                });
            }
        } catch (error) {
            console.error(`任务 ${taskId} 执行失败:`, error);
            eventBus.emit('LOAD_ERROR', { taskId, error });
        } finally {
            this.activeTasks--;
            
            // 继续处理队列中的其他任务
            this.processQueue();
        }
    }

    // 获取缓存的资源
    public getResource(resourceId: string) {
        return this.cache.get(resourceId);
    }

    // 加载资源
    private async loadResource(filePath: string, fileType: string, resourceType: string): Promise<any> {
        // 检查是否已缓存
        if (this.cache.has(filePath)) {
            return this.cache.get(filePath);
        }
        
        // 尝试从ServiceWorker缓存获取
        try {
            const cachedResponse = await caches.match(filePath);
            if (cachedResponse) {
                const blob = await cachedResponse.blob();
                const objectURL = URL.createObjectURL(blob);
                return this.processResource(objectURL, fileType, resourceType, filePath);
            }
        } catch (error) {
            console.warn('从缓存获取资源失败:', error);
        }
        
        // 如果未缓存，从网络加载
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`获取资源失败: ${response.statusText}`);
            }
            
            // 添加到缓存
            if (this.serviceWorker && 'caches' in window) {
                const cache = await caches.open('resource-cache');
                await cache.put(filePath, response.clone());
            }
            
            const blob = await response.blob();
            const objectURL = URL.createObjectURL(blob);
            return this.processResource(objectURL, fileType, resourceType, filePath);
        } catch (error) {
            console.error('加载资源失败:', error);
            throw error;
        }
    }

    // 处理不同类型的资源
    private processResource(objectURL: string, fileType: string, resourceType: string, filePath: string): Promise<any> {
        return new Promise((resolve, reject) => {
            switch (fileType) {
                case 'gltf':
                    this.gltfLoader.load(objectURL, (gltf) => {
                        const eventName = `${resourceType.toUpperCase()}_READY`;
                        eventBus.emit(eventName, { resource: gltf, path: filePath });
                        resolve({ type: resourceType, resource: gltf, path: filePath });
                    }, 
                    (progress) => {
                        // 加载进度
                        eventBus.emit('RESOURCE_PROGRESS', {
                            type: resourceType,
                            path: filePath,
                            loaded: progress.loaded,
                            total: progress.total
                        });
                    }, 
                    (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    });
                    break;
                    
                case 'texture':
                    const textureLoader = new THREE.TextureLoader();
                    textureLoader.load(objectURL, (texture) => {
                        const eventName = `${resourceType.toUpperCase()}_READY`;
                        eventBus.emit(eventName, { resource: texture, path: filePath });
                        resolve({ type: resourceType, resource: texture, path: filePath });
                    }, 
                    (progress) => {
                        // 加载进度
                        eventBus.emit('RESOURCE_PROGRESS', {
                            type: resourceType,
                            path: filePath,
                            loaded: progress.loaded,
                            total: progress.total
                        });
                    }, 
                    (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    });
                    break;
                    
                case 'skybox':
                    const cubeTextureLoader = new THREE.CubeTextureLoader();
                    // 针对天空盒的特殊处理
                    if (filePath.includes('/skybox/') || resourceType === 'skybox') {
                        // 假设天空盒文件是按照约定的命名方式存储的
                        const basePath = filePath.substring(0, filePath.lastIndexOf('/'));
                        const sides = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];
                        const urls = sides.map(side => `${basePath}/${side}`);
                        
                        cubeTextureLoader.load(urls, (cubeTexture) => {
                            eventBus.emit('SKYBOX_READY', { resource: cubeTexture, path: filePath });
                            resolve({ type: 'skybox', resource: cubeTexture, path: filePath });
                        }, 
                        (progress) => {
                            eventBus.emit('RESOURCE_PROGRESS', {
                                type: 'skybox',
                                path: filePath,
                                loaded: progress.loaded,
                                total: progress.total
                            });
                        }, 
                        (error) => {
                            eventBus.emit('LOAD_ERROR', error);
                            reject(error);
                        });
                    }
                    break;
                    
                case 'map':
                    fetch(objectURL)
                        .then(response => response.json())
                        .then(mapData => {
                            eventBus.emit('MAP_READY', { resource: mapData, path: filePath });
                            resolve({ type: 'map', resource: mapData, path: filePath });
                        })
                        .catch(error => {
                            eventBus.emit('LOAD_ERROR', error);
                            reject(error);
                        });
                    break;
                    
                case 'text':
                    fetch(objectURL)
                        .then(response => response.text())
                        .then(text => {
                            eventBus.emit('TEXT_READY', { resource: text, path: filePath });
                            resolve({ type: 'text', resource: text, path: filePath });
                        })
                        .catch(error => {
                            eventBus.emit('LOAD_ERROR', error);
                            reject(error);
                        });
                    break;
                    
                default:
                    reject(new Error(`不支持的文件类型: ${fileType}`));
            }
        });
    }

    // 获取资源目录结构
    private async fetchResource(path: string): Promise<any> {
        try {
            const response = await fetch(path, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`获取资源目录失败: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('读取资源目录失败:', error);
            throw error;
        }
    }
}
