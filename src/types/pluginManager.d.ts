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

export default class PluginManager implements PluginManagerType {
    private registry: Map<string, { instance: PluginInstance; metadata: PluginMeta }>;
    constructor();
    registerPlugin(pluginMeta: PluginMeta): void;
    loadPlugin(name: string): Promise<void>;
    unloadPlugin(pluginId: string): void;
    getPlugin(name: string): PluginInstance | undefined;
    fetchPluginCode(plugin: PluginMeta): Promise<string>;
    startAll(): Promise<void>;
    hasPlugin(name: string): boolean;
}

// 状态跟踪事件类型
export interface PluginStateEvent {
    name: string;
    state: 'loaded' | 'initialized' | 'activated';
    timestamp: number;
}