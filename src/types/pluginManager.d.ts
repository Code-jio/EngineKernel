import { PluginMeta, Plugin } from './Plugin';
import { CoreType,PluginInstance } from './core';


export interface PluginManagerType {
    fetchPluginCode(plugin: PluginMeta): Promise<string>;
    registerPlugin(meta: PluginMeta): void;
    loadPlugin(name: string): Promise<void>;
    unloadPlugin(name: string): void;
    getPlugin(name: string): PluginInstance | undefined;
    startAll(): Promise<void>;
}

export declare class PluginManager<T extends Plugin = Plugin> implements PluginManagerType {
  private readonly plugins;
  private readonly coreInstance;

  constructor(coreInstance: CoreType);

  registerPlugin(pluginMeta: PluginMeta): void;
  loadPlugin(pluginName: string): Promise<void>;
  unloadPlugin(pluginId: string): boolean;
  getPlugin(name: string): PluginInstance | undefined;
  validatePlugin(plugin: T): { valid: boolean; errors: string[] };
  notifyPlugins(event: string, payload?: unknown): void;
  fetchPluginCode(plugin: PluginMeta): Promise<string>;
  startAll(): Promise<void>;
}