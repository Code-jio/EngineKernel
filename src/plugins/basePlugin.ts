import { PluginMeta } from '../types/Plugin';

export class BasePlugin {
    name: string;
    path: string;
    strategy: 'sync' | 'async';
    status: 'unloaded' | 'loaded' | 'error';
    dependencies: string[];
    instance: any;
    exports: any;
    constructor(meta: PluginMeta) {
        if (!meta.name || !meta.path) {
            throw new Error('Plugin metadata must contain name and path');
        }

        // 初始化类型属性
        this.name = meta.name;
        this.path = meta.path;
        this.strategy = meta.strategy || 'sync';
        this.status = 'unloaded';
        this.dependencies = meta.dependencies || [];
        this.instance = null;
    }

    // 添加方法参数类型
    async init(coreInterface: any): Promise<void> { }
    // 加载
    async load(): Promise<void> { }
    // 暂停
    async stop(): Promise<void> { }
    // 卸载
    async unload(): Promise<void> { 
        this.status = 'unloaded';
    }
}

export default BasePlugin;