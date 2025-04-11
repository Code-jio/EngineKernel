import { PluginMeta } from '../types/Plugin';

export class BasePlugin {
    // 添加类型声明
    name: string;
    path: string;
    strategy: 'sync' | 'async';
    status: 'unloaded' | 'loaded' | 'error';
    dependencies: string[];
    instance: any;

    constructor(meta: PluginMeta) { // 添加参数类型
        // 添加元数据校验
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
    async start(): Promise<void> { }
    async stop(): Promise<void> { }
}

export default BasePlugin;