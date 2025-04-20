import eventBus from "../eventBus/eventBus"
import type { PluginInstance, CoreType, EventBus } from "../types/core"
import type { PluginMeta } from "../types/Plugin"
import type { PluginManagerType } from "../types/pluginManager"
import { validateGLParams, validateShader } from "../utils/glValidator"

// 插件管理器
export default class PluginManager implements PluginManagerType {
    static instance: PluginManager // 单例
    private registry = new Map<
        string,
        {
            instance: PluginInstance
            metadata: {
                name: string
                version: string
                status: "registered" | "running" | "stopped"
                dependencies: string[]
            }
        }
    >()
    private eventBus: EventBus
    private coreInterface: any
    // private coreInstance: CoreType

    constructor(core?: CoreType) {
        // 事件总线
        this.eventBus = eventBus

        // 核心接口
        this.coreInterface = {}
    }

    static getInstance(core?: CoreType) {
        if (!PluginManager.instance) {
            PluginManager.instance = new PluginManager(core)
        }
        return PluginManager.instance
    }

    // 注册插件
    registerPlugin(pluginMeta: PluginMeta): void {
        const plugin = new (pluginMeta.pluginClass as any)()
        this.registry.set(pluginMeta.name, {
            instance: plugin,
            metadata: {
                name: pluginMeta.name,
                version: pluginMeta.version as string,
                status: "registered",
                dependencies: pluginMeta.dependencies ?? [],
            },
        })
        plugin.init(this.coreInterface)
    }

    // 加载插件
    async loadPlugin(name: string): Promise<void> {
        const plugin = this.registry.get(name)

        if (!plugin) {
            throw new Error(`Plugin ${name} not found`)
        }

        if (plugin.metadata.status === "running") {
            console.warn(`Plugin ${name} is already running`)
            return
        }

        await plugin.instance.start()
        plugin.metadata.status = "running"
    }

    // 卸载插件
    unloadPlugin(name: string): void {
        const plugin = this.registry.get(name)

        if (!plugin) {
            throw new Error(`Plugin ${name} not found`)
        }

        if (plugin.metadata.status !== "running") {
            console.warn(`Plugin ${name} is not running`)
            return
        }

        plugin.instance.stop()
        plugin.metadata.status = "stopped"
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
            await instance.start()
            const plugin = this.registry.get(name)
            if (plugin) {
                plugin.metadata.status = "running"
            }
        }
    }
}
