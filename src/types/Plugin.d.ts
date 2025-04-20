import { PluginInstance } from "./core";
// 插件元数据接口 : 
interface PluginMeta {
    name: string;
    pluginClass: new () => PluginInstance;
    path: string;
    strategy?: 'sync' | 'async';
    dependencies?: string[];
    version?: string;
    metadata?: {
        author?: string;
        description?: string;
    };
}

// 插件接口
interface Plugin {
    PluginMeta: PluginMeta;
    version: string;
    init(): void;
    destroy(): void;
}

export type { PluginMeta, Plugin };