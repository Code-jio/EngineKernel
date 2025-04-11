import EventBus from '../eventBus/eventBus.js';
import PluginManager from './pluginManager.js';
import { BasePlugin } from '../plugins/basePlugin.js';
import { isValidPath } from '../utils/pathUtils.js';

export default class Core {
  constructor() {
    this.pluginRegistry = new Map(); // 插件注册表
    this.eventBus = EventBus; // 使用事件总线通信
    this.pluginManager = new PluginManager(); // 插件管理器实例
    this.loadStrategies = {
      sync: this._loadSync.bind(this),
      async: this._loadAsync.bind(this)
    };
  }

  // 增强注册方法
  registerPlugin(pluginMeta) {
    // 添加前置事件
    this.eventBus.emit('beforePluginRegister', pluginMeta);
    
    if (this.pluginRegistry.has(pluginMeta.name)) {
      const error = new Error(`Plugin ${pluginMeta.name} already registered`);
      this.eventBus.emit('registrationError', { meta: pluginMeta, error });
      throw error;
    }
    
    try {
      const plugin = new BasePlugin(pluginMeta);
      this.pluginRegistry.set(plugin.name, plugin);
      // 添加带校验的注册事件
      this.eventBus.emit('pluginRegistered', { 
        name: plugin.name,
        version: plugin.version,
        dependencies: plugin.dependencies
      });
      return true;
    } catch (error) {
      this.eventBus.emit('registrationError', { meta: pluginMeta, error });
      throw new Error(`Plugin registration failed: ${error.message}`);
    }
  }

  // 增强加载方法
  async loadPlugin(pluginName) {
    const plugin = this.pluginRegistry.get(pluginName);
    if (!plugin) {
      const error = new Error(`Plugin ${pluginName} not registered`);
      this.eventBus.emit('loadError', { pluginName, error });
      throw error;
    }

    try {
      // 添加加载前事件
      this.eventBus.emit('beforePluginLoad', pluginName);
      await this.loadStrategies[plugin.strategy](plugin);
      
      // 添加初始化后事件
      plugin.status = 'loaded';
      this.eventBus.emit('pluginInitialized', {
        name: pluginName,
        exports: plugin.instance.getExports?.() || null
      });
      
    } catch (error) {
      // 增强错误信息
      this.eventBus.emit('loadError', {
        pluginName,
        error,
        stack: error.stack
      });
      plugin.status = 'error';
      throw error;
    }
  }

  // 增强卸载方法
  unregisterPlugin(pluginName) {
    // 添加前置检查事件
    this.eventBus.emit('beforePluginUnregister', pluginName);
    
    if (!this.pluginRegistry.has(pluginName)) {
      this.eventBus.emit('unregisterWarning', `Attempt to unregister non-existent plugin: ${pluginName}`);
      return false;
    }
    
    const plugin = this.pluginRegistry.get(pluginName);
    try {
      // 添加卸载前事件
      this.eventBus.emit('beforePluginUnload', plugin);
      this._unload(plugin);
      
      this.pluginRegistry.delete(pluginName);
      // 添加详细卸载完成事件
      this.eventBus.emit('pluginUnregistered', {
        name: pluginName,
        timestamp: Date.now()
      });
      return true;
    } catch (error) {
      this.eventBus.emit('unloadError', { plugin, error });
      return false;
    }
  }

  // 同步加载策略
  async _loadSync(plugin) { // 添加 async 关键字
    if (!isValidPath(plugin.path)) {
      throw new Error('Invalid plugin path');
    }
    const module = await import(/* webpackIgnore: true */ plugin.path);
    plugin.instance = module.default ? new module.default(this) : module;
    plugin.instance.initialize?.();
  }

  // 异步加载策略
  async _loadAsync(plugin) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = plugin.path;
      script.onload = () => {
        plugin.instance = window[plugin.name];
        plugin.instance?.initialize?.(this); // 添加空值校验
        resolve();
      };
      script.onerror = (e) => reject(new Error(`Failed to load ${plugin.name}: ${e.message}`)); // 增强错误信息
      document.head.appendChild(script);
    });
  }

  // 卸载插件实例
  _unload(plugin) {
    plugin.instance?.uninstall?.();
    plugin.instance = null;
    plugin.status = 'unloaded';
  }
}

// const core = new Core();

// // 注册插件
// core.registerPlugin({
//   name: 'logger',
//   path: '/plugins/logger.js',
//   strategy: 'async'
// });

// // 加载插件
// await core.loadPlugin('logger');

// // 卸载插件
// core.unregisterPlugin('logger');