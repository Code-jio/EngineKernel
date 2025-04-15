interface PluginMeta {
    name: string;
    path: string;
    strategy?: 'sync' | 'async';
    dependencies?: string[];
    version?: string;
}

interface PluginManager {
    registerPlugin(pluginMeta: PluginMeta): void;
    loadPlugin(pluginName: string): Promise<void>;
    unloadPlugin(pluginName: string): void;
    getPlugin(pluginName: string): PluginMeta | undefined;
}

export type { PluginMeta, PluginManager };