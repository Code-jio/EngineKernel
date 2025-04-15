interface PluginInstance {
  initialize(core: Core): void;
  uninstall(): void;
  getExports?(): Record<string, unknown>;
}

interface Core {
  registerPlugin(plugin: PluginInstance): void;
  unregisterPlugin(plugin: PluginInstance): void;
  getPlugin(name: string): PluginInstance | undefined;
}