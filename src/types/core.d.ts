interface IPlugin {
  initialize(core: Core): void;
  uninstall(): void;
  getExports?(): Record<string, unknown>;
}