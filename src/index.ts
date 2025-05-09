// import Core from "./core/core";

import pluginManager from "./core/pluginManager";
import eventBus from "./eventBus/eventBus";
import BaseCore from "./core/baseCore";
// console.log(BaseCore, 22222)

export { 
    // Core,
    eventBus, 
    pluginManager, 
    BaseCore 
};

export * from './plugins'; // 导出所有插件模块