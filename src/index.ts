import pluginManager from "./core/pluginManager";
import eventBus from "./eventBus/eventBus";
import BaseCore from "./core/baseCore";
import { THREE } from "./plugins/basePlugin";
// 导入所有插件
import * as plugins from './plugins';

// 创建完整模块实例
const engineKernel: any = {
    THREE,
    eventBus,
    pluginManager,
    BaseCore,
    ...plugins
};

// 挂载到window上面并暴露出去
(window as any).EngineKernel = engineKernel;
console.log("🚀 ~ engineKernel:", engineKernel)

export default engineKernel;