import { PluginMeta, Plugin } from './Plugin';
import { CoreType, PluginInstance } from './core';

export interface PluginManagerType {
    fetchPluginCode(plugin: PluginMeta): Promise<string>;
    registerPlugin(pluginMeta: PluginMeta): void;
    loadPlugin(name: string): Promise<void>;
    unloadPlugin(name: string): void;
    getPlugin(name: string): PluginInstance | undefined;
    startAll(): Promise<void>;
    hasPlugin(name: string): boolean;
    unregisterPlugin(plugin: PluginInstance): void;
}