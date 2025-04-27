import eventBus from "../eventBus/eventBus"
import type { PluginInstance, CoreType, EventBus } from "../types/core"
import type { PluginMeta } from "../types/Plugin"
import type { PluginManagerType } from "../types/pluginManager"
import { validateGLParams, validateShader } from "../utils/glValidator"

// 插件管理器
export default class PluginManager implements PluginManagerType {
    private registry = new Map<
        string,
        {
            instance: PluginInstance
            metadata: {
                name: string
                version: string
                status: "registered" | "loaded" | "initialized" | "activated"
                dependencies: string[]
            }
        }
    >()
    private eventBus: EventBus
    private coreInterface: any
    // private coreInstance: CoreType

    constructor() {
        // 事件总线
        this.eventBus = eventBus

        // 核心接口
        this.coreInterface = {}
    }

    // 注册插件
    registerPlugin(plugin: PluginInstance): void {
        if (this.hasPlugin(plugin.name)) {
            throw new Error(`Plugin ${plugin.name} already exists`)
        }

        this.registry.set(plugin.name, {
            instance: plugin,
            metadata: {
                name: plugin.name,
                version: plugin.version,
                status: "registered", // 初始状态为注册
                dependencies: plugin.dependencies || [], // 依赖项
            },
        })
        // plugin.init(this.coreInterface) // 初始化插件
    }

    // 加载插件
    async loadPlugin(name: string): Promise<void> {
        const plugin = this.registry.get(name)

        if (!plugin) {
            throw new Error(`Plugin ${name} not found`)
        }

        if (plugin.metadata.status === "activated") {
            console.warn(`Plugin ${name} is already activated`)
            return
        }

        await plugin.instance.start()
        plugin.metadata.status = "activated"
    }

    // 卸载插件
    unloadPlugin(name: string): void {
        const plugin = this.registry.get(name)

        if (!plugin) {
            throw new Error(`Plugin ${name} not found`)
        }

        if (plugin.metadata.status !== "activated") {
            console.warn(`Plugin ${name} is not activated`)
            return
        }

        plugin.instance.stop()
        plugin.metadata.status = "registered"
    }

    // 获取插件实例
    getPlugin(name: string): PluginInstance | undefined {
        return this.registry.get(name)?.instance
    }

    // 获取插件代码
    async fetchPluginCode(plugin: PluginMeta): Promise<string> {
        const response = await fetch(`/plugins/${plugin.name}.js`)
        return response.text()
    }

    // 启动所有插件
    async startAll() {
        for (const [name, { instance }] of Array.from(this.registry.entries())) {
            await this.loadPlugin(name)
        }
    }

    // 检查插件是否存在
    hasPlugin(name: string): boolean {
        return this.registry.has(name)
    }

    // 注销插件
    unregisterPlugin(plugin: PluginInstance): void {
        this.registry.delete(plugin.name)
    }
}
