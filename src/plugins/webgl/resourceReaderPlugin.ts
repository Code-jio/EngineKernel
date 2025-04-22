// 增强后的资源读取插件
import BasePlugin from "plugins/basePlugin"
import * as THREE from "three"
import path from "path"
import fs from "fs"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import eventBus from "eventBus/eventBus"

/**
 * 功能要求：
 * 1.实现资源读取的异步任务队列（防止线程阻塞）
 * 2.支持serviceWorker静态资源缓存管理
 */

export default class RessourceReader extends BasePlugin {
    private url: string
    private taskQueue: Map<string, Promise<any>> = new Map()
    private workerPool: Worker[] = []
    private gltfLoader: GLTFLoader = new GLTFLoader()
    private totalTasks = 0

    constructor(meta: any) {
        super(meta)
        this.url = meta.userData.url
        this.initializeWorkerPool()
        this.gltfLoader = new GLTFLoader()
    }

    private initializeWorkerPool() {
        // 初始化3个Web Worker线程
        for (let i = 0; i < 3; i++) {
            this.workerPool.push(new Worker("/src/workers/resourceParser.worker.js"))
        }
    }

    async initialize() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("./public/sw.js")
                .then(registration => {
                    eventBus.emit("SERVICE_WORKER_READY")
                })
                .catch(error => {
                    eventBus.emit("SERVICE_WORKER_ERROR", error)
                })
        }
    }

    async parseResources() {
        // 任务队列调度逻辑
        this.totalTasks = this.taskQueue.size
        this.taskQueue.forEach((task, key) => {
            task.then(result => {
                const { data, path } = result
                if (!path) throw new Error("Invalid resource path")
                this.gltfLoader.parse(
                    result.data,
                    result.path,
                    gltf => {
                        eventBus.emit("GLTF_READY", {
                            type: "MODEL_LOADED",
                            payload: gltf,
                            resourcePath: path,
                        })
                    },
                    event => {
                        const errorCode = this.normalizeErrorCode(event)
                        eventBus.emit("GLTF_ERROR", {
                            type: "MODEL_ERROR",
                            payload: { errorCode, path },
                        })

                        console.log("加载失败", event)
                    },
                )
                eventBus.emit("RESOURCE_PROGRESS", {
                    progress: this.calculateProgress(),
                })
            }).catch(error => {
                eventBus.emit("RESOURCE_ERROR", error)
            })
        })
    }

    private calculateProgress(): number {
        // 计算加载进度
        return this.taskQueue.size > 0 ? ((this.totalTasks - this.taskQueue.size) / this.totalTasks) * 100 : 0
    }

    // 新增资源缓存方法
    async cacheResource(url: string) {
        const cache = await caches.open("engine-assets-v1")
        await cache.add(url)
    }

    normalizeErrorCode(event: any): string {
        if (event instanceof Error) {
            return event.message
        } else if (typeof event === "string") {
            return event
        } else {
            return "Unknown error"
        }
    }
}
