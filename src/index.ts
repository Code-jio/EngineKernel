/**
 * EngineKernel 入口文件
 */

import * as THREE from 'three';
import pluginManager from "./core/pluginManager";
import eventBus from "./eventBus/eventBus";
import BaseCore, { IBaseCore } from "./core/baseCore";

// 导出所有插件模块
import * as plugins from './plugins';

// 导出所有类型
export type { InitParams, IBaseCore } from './core/baseCore';

// 导出核心模块
export {
    THREE,
    eventBus,
    pluginManager,
    BaseCore
};

// 导出插件
export * from './plugins';

// 创建完整模块实例
const engineKernel = {
    THREE,
    eventBus,
    pluginManager,
    BaseCore,
    plugins
};

// 确保在浏览器环境中设置全局变量
if (typeof window !== 'undefined') {
    (window as any).EngineKernel = engineKernel;
}

// 默认导出完整模块
export default engineKernel;