import mitt from "mitt"
import { PluginMeta } from "./Plugin"
import { PluginManagerType } from "./pluginManager"

type EventBus = ReturnType<typeof mitt> & {
    once: (type: string, handler: Function) => void
}

interface BasePluginInterface {
    init?: () => void;
    start: () => Promise<void>;
    stop: () => void;
    uninstall?: () => void;
}

interface PluginInstance extends BasePluginInterface {
    status: string
    exports: Record<string, unknown>
    interface: Record<string, unknown>
    path: string
    name: string
    version: string
    dependencies: string[]
    pluginMeta: PluginMeta
    strategy: 'sync' | 'async'
    metadata?: PluginMeta['metadata'];
    pluginClass: new () => PluginInstance;
    initialize(core: CoreType): void
    getExports?(): Record<string, unknown>
    instance: any;
}

interface CoreType {
    pluginRegistry: Map<string, PluginInstance>
    eventBus: EventBus
    pluginManager: PluginManagerType
    loadStrategies: { [key: string]: (plugin: PluginInstance) => Promise<void> }
    _messageChannels: Map<string, any>
    performance: {
        metrics: Map<string, { startTime: number; endTime: number }>
        enable: boolean
    }
    components: any;
    _servicePermissions: any;
    
    registerPlugin(pluginMeta: PluginMeta): void
    unregisterPlugin(plugin: PluginInstance): void
    getPlugin(name: string): PluginInstance | undefined
    configureServicePermissions<T extends any[]>(service: string, permissions: T): T
}

export type { PluginInstance, CoreType, EventBus }
