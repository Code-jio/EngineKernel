// 增强后的资源读取插件
import { THREE, BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"


// 加载path底下所有的文件，以文件名为key，文件路径为value，返回一个对象。 这个path是一个文件目录路径
const getResource = async (basePath: string) => {
    try {
        const response = await fetch(`${basePath}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`目录请求失败: ${response.status}`);
        const contentType = response.headers.get('Content-Type');
        if (!contentType?.includes('application/json')) {
            const text = await response.text();
            throw new Error(`无效的响应类型: ${contentType} - 响应内容: ${text.substring(0, 100)}`);
        }
        const entries = await response.json();
        console.log("🚀 ~ getResource ~ entries:", entries)

        const fileMap: { [key: string]: string } = {};
        const processEntry = async (entry: any) => {
            const entryPath = `${basePath}/${encodeURIComponent(entry.name)}`;
            if (entry.type === 'directory') {
                const subFiles = await getResource(entryPath);
                console.log(subFiles,"subfiles")
                Object.assign(fileMap, subFiles);
            } else if (entry.type === 'file') {
                fileMap[entry.name] = entryPath;
                eventBus.emit('FILE_FOUND', { name: entry.name, path: entryPath });
            }
        };
        await Promise.all(entries.map(processEntry));
        console.log(`资源加载完成: ${basePath}`, fileMap);
        return fileMap;
    } catch (error) {
        console.error(`资源加载失败: ${basePath}`, error);
        eventBus.emit('LOAD_ERROR', error);
        throw error;
    }
};

const validateResourcePath = (path: string) => {
    if (!path || !/^[\w\-/.:]+$/.test(path) || path.endsWith('.html')) {
        throw new Error(`Invalid resource path: ${path}`);
    }
    return path;
};

/**
 * 预期功能要求：
 * 1.实现资源读取的异步任务队列（防止线程阻塞）
 * 2.使用workBox完成资源缓存管理
 * 3.参数输入仅给一个文件路径，根据该文件路径下各个文件夹名称不同，分成各个不同的加载任务，形成一个加载队列
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

    constructor(meta: any) {
        super(meta)
        this.url = meta?.userData?.url || "";
        validateResourcePath(this.url);
        this.gltfLoader = new GLTFLoader()
        this.loadFromDirectory(this.url)
    }

    // 从目录加载资源
    async loadFromDirectory(dirPath: string) {
        try {
            eventBus.emit('DIR_SCAN_START', { path: dirPath });
            const fileMap = await getResource(dirPath);
            
            const tasks = Object.entries(fileMap).map(([fileName, filePath]) => {
                const fileType = this.getFileType(fileName);
                return this.loadResource(filePath as string, fileType);
            });

            await Promise.all(tasks);
            eventBus.emit('DIR_SCAN_COMPLETE', {
                path: dirPath,
                totalFiles: Object.keys(fileMap).length
            });
        } catch (error) {
            console.error('目录加载失败:', error);
            eventBus.emit('LOAD_ERROR', error);
        }
    }

    // 添加任务
    private addTask(task: () => Promise<any>) {
        this.taskQueue.set(task.name, task())
        this.totalTasks++
        this.processQueue()
    }

    // 处理任务队列
    private async processQueue() {
        if (this.activeTasks >= this.maxConcurrent) return
        this.activeTasks++
        const task = this.taskQueue.values().next().value
        if (task) {
            try {
                const result = await task;
                this.cache.set(result.name, result)
                this.activeTasks--
                this.totalTasks--
                this.processQueue()
            } catch (error) {
                console.error('Error processing task:', error)
                this.activeTasks--
                this.totalTasks--
                this.processQueue()
            }
        }
    }

    private async loadResource(filePath: string, fileType: string) {
        if (this.cache.has(filePath)) {
            const cachedResponse = await caches.open('my-cache').then(cache => cache.match(filePath));
            if (cachedResponse) {
                const contentType = cachedResponse.headers.get('Content-Type');
                if (contentType && contentType.includes('application/json')) {
                    return cachedResponse.json();
                }
            }
        }
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to fetch resource: ${response.statusText}`);
        }

        // 新增响应内容预检
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            if (text.startsWith('<')) {
                throw new Error(`HTML content detected: ${text.substring(0, 100)}...`);
            }
            throw new Error(`Invalid content type: ${contentType}`);
        }

        // 验证JSON格式有效性
        const rawData = await response.text();
        try {
            JSON.parse(rawData);
        } catch (e) {
            throw new Error(`Invalid JSON format: ${rawData.substring(0, 100)}...`);
        }
        const fileList = JSON.parse(rawData);
        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);
        return new Promise((resolve, reject) => {
            switch (fileType) {
                case 'gltf':
                    this.gltfLoader.load(objectURL, (gltf) => {
                        eventBus.emit('GLTF_READY', { asset: gltf, path: filePath });
                        resolve({ ...gltf, path: filePath });
                    }, undefined, (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    });
                    break;
                case 'texture':
                    const textureLoader = new THREE.TextureLoader();
                    textureLoader.load(objectURL, (texture) => {
                        eventBus.emit('TEXTURE_READY', { asset: texture, path: filePath });
                        resolve({ texture, path: filePath });
                    }, undefined, (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    });
                    break;
                case 'skybox':
                    const cubeTextureLoader = new THREE.CubeTextureLoader();
                    cubeTextureLoader.load([filePath], (cubeTexture) => {
                        eventBus.emit('SKYBOX_READY', { asset: cubeTexture, path: filePath });
                        resolve({ ...cubeTexture, path: filePath });
                    }, undefined, (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    });
                    break;
                default:
                    reject(new Error(`Unsupported file type: ${fileType}`));
            }
        });
    }

    // 根据文件扩展名获取资源类型
    private getFileType(file: string) {
        const extension = file.split('.').pop();
        switch (extension) {
            case 'gltf':
            case 'glb':
                return 'gltf';
            case 'jpeg':
            case 'bmp':
            case 'jpg':
            case 'png':
                return 'texture';
            case 'dds':
                return 'texture';
            case 'skybox':
                return 'skybox';
            default:
                throw new Error(`Unsupported file type: ${extension}`);
        }
    }
}
