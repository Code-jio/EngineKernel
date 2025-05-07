// 增强后的资源读取插件
import { THREE, BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { Workbox } from "workbox-window"
import Strategy from "workbox-strategies"

const fetchResource = async (path: string) => {
    try {
        const response = await fetch(path, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch resource: ${response.statusText}`);
        }
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Invalid content type: ${contentType}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching resource:', error);
        throw error;
    }
};

const validateResourcePath = (path: string) => {
    if (!path) {
        throw new Error('Resource path is required');
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
    private wb: Workbox | null = null;

    constructor(meta: any) {
        super(meta)
        this.url = meta?.userData?.url || "/public";
        validateResourcePath(this.url);
        this.gltfLoader = new GLTFLoader()
        this.loadFromDirectory(this.url)
    }

    // 从目录加载资源
    async loadFromDirectory(dirPath: string) {
        try {
            const files = await fetchResource(dirPath)
            files.forEach((file: any) => {
                try {
                    const fileType = this.getFileType(file);
                    if (!['gltf','texture','skybox','text'].includes(fileType)) {
                        console.warn(`Skipped unsupported file type: ${file}`);
                        return;
                    }
                    const filePath = encodeURI(`${dirPath}/${file}`)
                    this.addTask(() => this.loadResource(filePath, fileType))
                } catch (error) {
                    console.error('Error processing file:', file, error);
                }
            })
            await this.processQueue()
        } catch (error) {
            console.error('Error loading directory:', error);
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
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Invalid content type: ${contentType}`);
        }
        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);
        return new Promise((resolve, reject) => {
            switch (fileType) {
                case 'gltf':
                    this.gltfLoader.load(objectURL, (gltf) => {
                        eventBus.emit('GLTF_READY', gltf);
                        resolve(gltf);
                    }, undefined, (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    });
                    break;
                case 'texture':
                    const textureLoader = new THREE.TextureLoader();
                    textureLoader.load(objectURL, (texture) => {
                        eventBus.emit('TEXTURE_READY', texture);
                        resolve(texture);
                    }, undefined, (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    });
                    break;
                case 'text':
                    fetch(objectURL)
                        .then(response => response.text())
                        .then(text => {
                            eventBus.emit('TEXT_READY', text);
                            resolve(text);
                        })
                        .catch(error => {
                            eventBus.emit('LOAD_ERROR', error);
                            reject(error);
                        });
                case 'script':
                    const script = document.createElement('script');
                    script.src = objectURL;
                    script.onload = () => {
                        eventBus.emit('SCRIPT_LOADED', { url: objectURL });
                        resolve(script);
                    };
                    script.onerror = (error) => {
                        eventBus.emit('LOAD_ERROR', error);
                        reject(error);
                    };
                    document.head.appendChild(script);
                    break;
                    break;
                case 'skybox':
                    return 'skybox';
                case 'md':
                    return 'text';
                case 'js':
                case 'ts':
                    return 'script';
                default:
                throw new Error(`Unsupported file type: ${fileType}`);
            }
        });
    }

    // FIXME: 扩展性达不到要求，后续需要根据文件路径下的各个文件夹名称不同，分成各个不同的加载任务，形成一个加载队列，
    // 后续还会涉及到天空盒、地图数据的加载，需要对资源读取插件进行扩展
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
            case 'md':
                return 'text';
            case 'js':
                return 'script';
            default:
                throw new Error(`Unsupported file type: ${extension}`);
        }
    }

    // 后缀为js、ts、
    ignore() {
        return true;
    }
}
