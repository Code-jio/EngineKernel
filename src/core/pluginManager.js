import eventBus from "@/eventBus/eventBus.ts";
// 插件管理器
export default class PluginManager {
  constructor() {
    // 插件注册表
    this.registry = new Map();

    // 事件总线
    this.eventBus = eventBus;

    // 核心接口
    this.coreInterface = {};
  }

  // 注册插件
  register(pluginClass) {
    const plugin = new pluginClass();
    this.registry.set(plugin.name, {
      instance: plugin,
      metadata: {
        name: plugin.name,
        version: plugin.version,
        status: "registered",
      },
    });
    plugin.init(this.coreInterface);
  }

  // 启动所有插件
  async startAll() {
    for (const [name, { instance }] of this.registry) {
      await instance.start();
      this.registry.get(name).metadata.status = "running";
    }
  }
}
