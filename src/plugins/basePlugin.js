// 插件基类定义
export class BasePlugin {
    constructor(meta) {
        this.name = meta.name;
        this.path = meta.path;
        this.strategy = meta.strategy || 'sync'; // 加载策略：sync/async
        this.status = 'unloaded'; // 插件状态：unloaded/loaded/error
        this.dependencies = meta.dependencies || [];
        this.instance = null;
    }
  
    // 生命周期方法
    async init(coreInterface) {}
    async start() {}
    async stop() {}
}

export default BasePlugin;