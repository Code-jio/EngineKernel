import { PluginMeta, Plugin } from './Plugin';
import { CoreType, PluginInstance } from './core';

export interface PluginManagerType {
    fetchPluginCode(plugin: PluginMeta): Promise<string>;
    registerPlugin(pluginMeta: PluginMeta): void;
    loadPlugin(name: string): Promise<void>;
    unloadPlugin(name: string): void;
    getPlugin(name: string): PluginInstance | undefined;
    startAll(): Promise<void>;
}

export default class PluginManager implements PluginManagerType {
    private registry: Map<string, { instance: PluginInstance; metadata: PluginMeta }>;
    constructor(private core?: CoreType);
    registerPlugin(pluginMeta: PluginMeta): void;
    loadPlugin(name: string): Promise<void>;
    unloadPlugin(pluginId: string): boolean;
    getPlugin(name: string): PluginInstance | undefined;
    fetchPluginCode(plugin: PluginMeta): Promise<string>;
    startAll(): Promise<void>;
}