/**
 * 从基础插件模块导入 BasePlugin 类
 * 该类通常作为所有插件的基类，定义插件的基本结构和方法
 */
import { BasePlugin } from "./plugins/basePlugin";

/**
 * 从核心模块导入 Core 类
 * 该类是整个应用的核心，负责协调各个模块的工作
 */
// 为了解决找不到模块声明文件的问题，使用 @ts-ignore 注释临时忽略类型检查
// 建议后续为 ./core/core.js 创建 .d.ts 声明文件以进行正确的类型检查
// @ts-ignore
import Core from "./core/core.js";

/**
 * 从插件管理模块导入插件管理器实例
 * 该实例负责管理所有插件的加载、卸载和调用
 */
import pluginManager from "./types/pluginManager.js";

/**
 * 从事件总线模块导入事件总线实例
 * 该实例负责处理应用内的事件发布和订阅
 */
import eventBus from "./eventBus/eventBus";

/**
 * 导出核心类、事件总线实例、插件管理器实例和基础插件类
 * 这些导出的模块可以在其他地方被引入和使用
 */
export { Core, eventBus, pluginManager, BasePlugin };