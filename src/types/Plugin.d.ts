interface PluginMeta {
    name: string;         // 插件唯一标识
    path: string;         // 插件文件路径
    strategy?: 'sync' | 'async';  // 加载策略
    dependencies?: string[];     // 依赖插件列表
}

export { PluginMeta };