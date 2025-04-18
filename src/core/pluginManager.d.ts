import { Plugin } from '../types/Plugin';

export declare class PluginManager<T extends Plugin = Plugin> {
  private readonly plugins;
  private readonly coreInstance;

  constructor(coreInstance: CoreType);

  loadPlugin(plugin: T): void;
  unloadPlugin(pluginId: string): boolean;
  getPlugin<T extends Plugin>(pluginId: string): T | undefined;
  validatePlugin(plugin: T): { valid: boolean; errors: string[] };
  notifyPlugins(event: string, payload?: unknown): void;
}