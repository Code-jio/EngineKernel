import { PluginMeta } from "../types/Plugin"
import * as THREE from "three"

class BasePlugin {
    readonly name: string
    readonly path: string
    readonly strategy: "sync" | "async"
    readonly dependencies: string[]

    status: "unloaded" | "loaded" | "error"
    instance: any
    exports: any

    constructor(meta: PluginMeta) {
        // 初始化不可变元数据
        this.name = meta.name
        this.path = meta.path
        this.strategy = meta.strategy || "sync"
        this.dependencies = meta.dependencies || []
        // 初始化运行时状态
        this.status = "unloaded"
    }

    // 添加方法参数类型
    async init(coreInterface: any): Promise<void> {}
    // 加载
    async load(): Promise<void> {}
    // 暂停
    // async stop(): Promise<void> {}
    // 卸载
    async unload(): Promise<void> {
        this.status = "unloaded"
    }
}

export { THREE, BasePlugin }
