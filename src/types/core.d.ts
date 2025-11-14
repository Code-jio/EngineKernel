import mitt, { Handler } from "mitt"
import { PluginMeta } from "./Plugin"
import { PluginManagerType } from "./pluginManager"

type EventBus = ReturnType<typeof mitt> & {
    on<T = unknown>(type: string, handler: Handler<T>): void;
    once<T = unknown>(type: string, handler: Handler<T>): void;
    off<T = unknown>(type: string, handler: Handler<T>): void;
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
    path: string
    name: string
    version: string
    dependencies: string[]
    instance: any
    strategy: 'sync' | 'async'
    metadata?: PluginMeta['metadata'];
    pluginClass: new (params:{ [key: string]: any }) => PluginInstance;
    initialize(): void
    getExports?(): Record<string, unknown>
}

interface CoreType {
    registry: Map<string, PluginInstance>;
    listeners: Map<string, Function>;
    
    loadStrategies: { [key: string]: (plugin: PluginInstance) => Promise<void> }
    _messageChannels: Map<string, any>
    performance: {
        metrics: Map<string, { startTime: number; endTime: number }>
        enable: boolean
    }
    components: Map<string, any>
    _servicePermissions: any;

    register(pluginMeta: PluginMeta): void
    unregisterPlugin(plugin: PluginInstance): void
    getPlugin(name: string): PluginInstance | undefined
    // configureServicePermissions<T extends any[]>(service: string, permissions: T): T
}

declare module '../types/core' {
    interface EventTypeMap {
        'viewport-resize': { width: number; height: number };
    }
}

export type { PluginInstance, CoreType, EventBus }
