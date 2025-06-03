
import pluginManager from "./core/pluginManager";
import eventBus from "./eventBus/eventBus";
import BaseCore from "./core/baseCore";

export { 
    eventBus, 
    pluginManager, 
    BaseCore,
};

export * from './plugins'; // 导出所有插件模块