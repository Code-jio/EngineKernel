import { PluginInstance } from "./core";
// 插件元数据接口 : 
interface PluginMeta {
    name: string;
    pluginClass: new (params:{ [key: string]: any }) => PluginInstance;
    path: string;
    strategy?: 'sync' | 'async';
    dependencies?: string[];
    version?: string;
    userData?: { [key: string]: any }; // 初始化参数
    metaData?: {
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