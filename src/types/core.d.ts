interface PluginInstance {
  initialize(core: Core): void;
  uninstall(): void;
  getExports?(): Record<string, unknown>;
}