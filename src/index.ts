/**
 * EngineKernel 入口文件
 */

import * as THREE from 'three';
import pluginManager from "./core/pluginManager";
import eventBus from "./eventBus/eventBus";
import BaseCore from "./core/baseCore";
import { THREE } from "./plugins/basePlugin";
// console.log(BaseCore, 22222)

export { 
    // Core,
    eventBus, 
    pluginManager, 
    BaseCore,
    THREE
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