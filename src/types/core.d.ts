import mitt from 'mitt';
import { PluginMeta, PluginManager } from './Plugin';


type EventBus = ReturnType<typeof mitt> & {
  once: (type: string, handler: Function) => void;
};

interface PluginInstance {
  initialize(core: Core): void;
  uninstall(): void;
  getExports?(): Record<string, unknown>;
}

interface Core {
  pluginRegistry: Map<string, PluginInstance>;
  eventBus: EventBus;
  pluginManager: PluginManager;
  loadStrategies: { [key: string]: (plugin: PluginInstance) => Promise<void> };
  registerPlugin(pluginMeta: PluginMeta): void;
  unregisterPlugin(plugin: PluginInstance): void;
  getPlugin(name: string): PluginInstance | undefined;
}

export type { PluginInstance, Core, EventBus };