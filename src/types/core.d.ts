interface PluginInstance {
  initialize(core: Core): void;
  uninstall(): void;
  getExports?(): Record<string, unknown>;
}

interface Core {
  registerPlugin(pluginMeta: PluginMeta): void;
  unregisterPlugin(plugin: PluginInstance): void;
  getPlugin(name: string): PluginInstance | undefined;
}

interface PluginMeta {
  name: string;
  version: string;
  dependencies?: string[];
}