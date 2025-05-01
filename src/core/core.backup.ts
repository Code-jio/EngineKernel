import eventBus from "../eventBus/eventBus"
import { BasePlugin } from "../plugins/basePlugin"
import { isValidPath } from "../utils/pathUtils"
import { validatePlugin } from "../utils/security"

import { CoreType, EventBus, PluginInstance } from "../types/core"
import type { PluginManagerType } from "../types/pluginManager"
import PluginManager from "./pluginManager"
import { PluginMeta, Plugin } from "../types/Plugin"

import { EventDispatcher } from "../eventBus/eventDispatch"
import { applyMixins } from "../decorators/mixinGuards"


// 定义 Core 类的依赖项接口
// interface InitParams {
//     pluginsParams: []
// }
// interface Core extends PluginManager, EventDispatcher {}
// class Core implements CoreType {
//     static STATUS = {
//         REGISTERED: "registered",
//         LOADING: "loading",
//         LOADED: "loaded",
//         ERROR: "error",
//         UNLOADING: "unloading",
//     }
//       registry: Map<string, PluginInstance>;
//   listeners: Map<string, Function>;
//     loadStrategies: { [key: string]: (plugin: PluginInstance) => Promise<void> }
//     performance: { metrics: Map<string, any>; enable: boolean }
//     components: any
//     _messageChannels: any
//     _servicePermissions: any
//     private logger = console
//     gpuManager: any
//     // scene: THREE.Scene & { skybox?: THREE.Mesh }

//     constructor(InitParams: InitParams) {
//         // super();
//         this.loadStrategies = {
//             sync: this._loadSync.bind(this),
//             async: this._loadAsync.bind(this),
//         }

//         this.performance = {
//             metrics: new Map(),
//             enable: true,
//         }
//         this.components = new Map() // 组件注册表
//         this._messageChannels = new Map() // 消息通道注册表
//         this._servicePermissions = new Map() // 服务权限

//         this.registry = new Map(); // 混入模式下的初始化方法
//         this.listeners = new Map(); // 混入模式下的初始化方法

//         // this.initializeEventSystem(); // 事件总线初始化
//         // this.initializePluginManager(); // 插件管理器配置


//         this._startAsyncInit(InitParams)
//     }

//     private async _startAsyncInit(InitParams: InitParams) {
//         if (InitParams.pluginsParams) {
//             for (const params of InitParams.pluginsParams) {
//                 if (params) {
//                     this.registerPlugin(params)
//                 }
//             }
//         }

//         await this.init()
//     }

//     private async init() {
//         this.emit("init-complete")
//     }

//     // // 事件总线初始化逻辑
//     // private initializeEventSystem() { /* 事件总线初始化逻辑 */ }
//     // // 插件管理器配置
//     // private initializePluginManager() { /* 插件管理器配置 */ }

//     getPlugin(name: string): PluginInstance | undefined {
//         return this.getPlugin(name)
//     }

//     // 注册
//     register(pluginMeta: PluginMeta) {
//         this.emit("beforePluginRegister", pluginMeta)

//         if (this.hasPlugin(pluginMeta.name)) {
//             const error = new Error(`插件 ${pluginMeta.name} 已经注册了`)
//             this.emit("PluginRegisterError", { meta: pluginMeta, error })
//             console.error(`插件 ${pluginMeta.name} 已经注册了`, error)
//         }
//         try {
//             // 强制校验插件类定义
//             if (!pluginMeta.pluginClass) {
//                 console.error("插件类未定义")
//             }
//             if (typeof pluginMeta.pluginClass !== "function") {
//                 console.error(`插件类必须是一个构造函数。收到的类型: ${typeof pluginMeta.pluginClass}`)
//             }
//             if (!(pluginMeta.pluginClass.prototype instanceof BasePlugin)) {
//                 console.error("插件类必须继承自BasePlugin")
//             }

//             const plugin: PluginInstance = new pluginMeta.pluginClass({
//                 name: pluginMeta.name,
//                 path: pluginMeta.path,
//                 dependencies: pluginMeta.dependencies || [],
//                 strategy: pluginMeta.strategy || "sync",
//                 userData: pluginMeta.userData,
//             })
//             plugin.status = Core.STATUS.REGISTERED

//             this.registerPlugin(plugin)
//             // 添加带校验的注册事件
//             this.emit("pluginRegistered", {
//                 name: plugin.name,
//                 version: pluginMeta.version,
//                 dependencies: plugin.dependencies,
//                 instaance: plugin,
//             })
//             return this
//         } catch (error) {
//             this.emit("registrationError", { meta: pluginMeta, error })
//             console.error("插件注册失败", { meta: pluginMeta, error })
//             return this
//         }
//     }

//     // // 加载
//     // async loadPlugin(pluginName: string) {
//     //     const plugin = this.getPlugin(pluginName)
//     //     if (!plugin) {
//     //         // throw new Error(`Plugin ${pluginName} not found`)
//     //         console.error(`插件 ${pluginName} 未找到`)
//     //         return false
//     //     }
//     //     plugin.status = Core.STATUS.LOADING

//     //     if (!plugin) {
//     //         const error = new Error(`插件 ${pluginName} 未注册`)
//     //         this.emit("loadError", { pluginName, error })
//     //         throw error
//     //     }

//     //     const perfMark = `pluginLoad:${pluginName}`
//     //     performance.mark(perfMark)

//     //     try {
//     //         const pluginCode = await this.fetchPluginCode(plugin)
//     //         const module = await import(/* webpackIgnore: true */ plugin.path)
//     //         plugin.instance = module.default ? new module.default(this) : module
//     //         plugin.exports = plugin.exports || {}
//     //         // plugin.interface = this._createPluginInterfaceProxy(plugin) // 创建插件接口代理

//     //         // 添加加载前事件
//     //         this.emit("beforePluginLoad", pluginName)
//     //         await this.loadStrategies[plugin.strategy](plugin)

//     //         // 添加初始化后事件
//     //         plugin.status = "loaded"
//     //         this.emit("pluginInitialized", {
//     //             name: pluginName,
//     //             exports: plugin.exports,
//     //         })
//     //         performance.measure(perfMark)
//     //     } catch (error) {
//     //         this.emit("loadError", {
//     //             pluginName,
//     //             error,
//     //             stack: error instanceof Error ? error.stack : undefined,
//     //         })
//     //         plugin.status = Core.STATUS.ERROR
//     //         this._rollbackPluginLoad(plugin) // 回滚
//     //         throw error
//     //     }
//     // }

//     // 卸载
//     unregisterPlugin(plugin: PluginInstance) {
//         // 添加前置检查事件
//         this.emit("beforePluginUnregister", plugin.name)

//         if (!this.hasPlugin(plugin.name)) {
//             this.emit("unregisterWarning", `Attempt to unregister non-existent plugin: ${plugin.name}`)
//             return false
//         }

//         try {
//             // 添加卸载前事件
//             this.emit("beforePluginUnload", plugin)
//             this._unload(plugin)

//             this.unregisterPlugin(plugin)
//             this.emit("pluginUnregistered", {
//                 name: plugin.name,
//                 timestamp: Date.now(),
//             })
//             return true
//         } catch (error) {
//             this.emit("unloadError", { plugin, error })
//             return false
//         }
//     }

//     // 同步加载策略
//     async _loadSync(plugin: PluginInstance) {
//         return this._withPerfMonitoring("loadSync", async () => {
//             if (!validatePlugin(plugin as PluginMeta)) {
//                 console.error("非法插件", { plugin })
//             }
//             if (!isValidPath(plugin.path)) {
//                 console.error("不正确的插件路径", { plugin })
//             }
//             const module = await import(/* webpackIgnore: true */ plugin.path)
//             plugin.instance = module.default ? new module.default(this) : module
//             // plugin.instance.initialize?.() // 初始化插件
//         })()
//     }

//     // 异步加载策略
//     async _loadAsync(plugin: PluginInstance): Promise<void> {
//         if (!validatePlugin(plugin as PluginMeta)) {
//             console.error("非法插件", { plugin })
//         }
//         if (!isValidPath(plugin.path)) {
//             console.error("不正确的插件路径", { plugin })
//         }
//         return new Promise((resolve, reject) => {
//             const script = document.createElement("script") as HTMLScriptElement
//             script.src = plugin.path
//             script.onload = () => {
//                 plugin.instance = (window as unknown as { [key: string]: any })[plugin.name]
//                 // plugin.instance?.initialize?.(this)
//                 resolve()
//             }
//             script.onerror = (e: Event | string) => {
//                 reject(new Error(`加载失败: ${e}`))
//             }
//             document.head.appendChild(script)
//         })
//     }

//     // 卸载插件实例
//     _unload(plugin: PluginInstance) {
//         // plugin.instance?.uninstall?.()
//         // plugin.instance = null
//         // plugin.status = Core.STATUS.UNLOADING
//     }

//     // // 创建插件接口代理
//     // _createPluginInterfaceProxy(plugin: PluginInstance) {
//     //     return new Proxy(plugin.exports, {
//     //         get: (target: any, prop: string | symbol) => {
//     //             if (prop === "registerComponent") {
//     //                 return (name: string, instance: unknown) => {
//     //                     this.components.set(name, instance)
//     //                     this.emit("componentRegistered", name)
//     //                 }
//     //             }
//     //             if (prop === "getCoreService") {
//     //                 return (serviceName: string) => {
//     //                     // 安全访问其他插件服务
//     //                     if (!this._isServiceAllowed(plugin.name, serviceName)) {
//     //                         throw new Error(`不允许访问 ${serviceName}`) // 被禁止访问
//     //                     }
//     //                     return this.components.get(serviceName)
//     //                 }
//     //             }
//     //             if (typeof target[prop] === "function") {
//     //                 return (...args: any[]) => {
//     //                     this.logger.log(`[${plugin.name}] Calling ${String(prop)}`)
//     //                     return target[prop](...args)
//     //                 }
//     //             }
//     //             return target[prop as keyof typeof target]
//     //         },
//     //     })
//     // }

//     // // 回滚
//     // _rollbackPluginLoad(plugin: PluginInstance) {
//     //     this.unregisterPlugin(plugin)
//     // }

//     // 装饰器
//     private _withPerfMonitoring<T>(
//         methodName: string,
//         fn: (...args: any[]) => Promise<T>,
//     ): (...args: any[]) => Promise<T> {
//         return async (...args) => {
//             if (!this.performance.enable) return fn(...args)

//             const start = performance.now()
//             const memBefore = process.memoryUsage().rss

//             try {
//                 const result = await fn(...args)
//                 const duration = performance.now() - start
//                 const memDelta = process.memoryUsage().rss - memBefore

//                 this._recordMetrics(methodName, {
//                     duration,
//                     memoryDelta: memDelta,
//                     success: true,
//                 })

//                 return result
//             } catch (error) {
//                 this._recordMetrics(methodName, {
//                     duration: performance.now() - start,
//                     error: (error as Error).message,
//                     success: false,
//                 })
//                 throw error
//             }
//         }
//     }

//     // 记录性能指标
//     _recordMetrics(
//         methodName: string,
//         data: { duration: number; memoryDelta?: number; error?: string; success: boolean },
//     ) {
//         const entry = this.performance.metrics.get(methodName) || {
//             callCount: 0, // 调用次数
//             totalDuration: 0, // 总耗时
//             successCount: 0, // 成功次数
//             errorCount: 0, // 错误次数
//             memoryChanges: [], // 内存变化
//         }

//         entry.callCount++
//         entry.totalDuration += data.duration
//         data.success ? entry.successCount++ : entry.errorCount++
//         entry.memoryChanges.push(data.memoryDelta)

//         this.performance.metrics.set(methodName, entry)
//         this.emit("performanceMetrics", { methodName, ...data })
//     }

//     // // GPU资源追踪
//     // _monitorGLResources(gl: WebGL2RenderingContext & any, pluginName: string) {
//     //     const methodsToTrack = {
//     //         createTexture: "createTexture",
//     //         createBuffer: "createBuffer",
//     //         createFramebuffer: "createFramebuffer",
//     //     } as Record<keyof WebGL2RenderingContext, string>

//     //     const proxy = new Proxy<WebGL2RenderingContext>(gl as unknown as WebGL2RenderingContext, {
//     //         get: (target, prop) => {
//     //             if (prop in target && methodsToTrack.hasOwnProperty(prop)) {
//     //                 const method = target[prop as keyof WebGL2RenderingContext] as (...args: number[]) => any
//     //                 return (...args: number[]) => {
//     //                     const resource = method.call(target, ...args)
//     //                     this._trackGLResource(pluginName, prop as keyof WebGL2RenderingContext, resource)
//     //                     return resource
//     //                 }
//     //             }
//     //             return target[prop as keyof typeof target]
//     //         },
//     //     })

//     //     // this.pluginRegistry
//     //     //     .get(pluginName)
//     //     //     ?.instance.setGLContext?.(proxy as unknown as WebGL2RenderingContext & typeof gl) // 设置代理上下文
//     // }

//     // // 记录GPU资源
//     // _trackGLResource(pluginName: string, type: keyof WebGL2RenderingContext, resource: any) {
//     //     const stats = this.performance.metrics.get("gpuResources") || {}
//     //     stats[pluginName] = stats[pluginName] || { textures: 0, buffers: 0, framebuffers: 0 }
//     //     stats[pluginName][String(type)]++
//     //     this.performance.metrics.set("gpuResources", stats)
//     // }

//     // // 获取组件
//     // getComponent(name: string) {
//     //     if (!this.components.has(name)) {
//     //         console.warn(`Component ${name} not found`)
//     //     }
//     //     return this.components.get(name)
//     // }

//     // // 服务白名单验证
//     // _isServiceAllowed(requester: string, serviceName: string) {
//     //     return this._servicePermissions.get(requester)?.includes(serviceName) || false
//     // }

//     // // 新增服务权限配置方法
//     // configureServicePermissions<T extends any[]>(pluginName: string, permissions: T): T {
//     //     this._servicePermissions.set(pluginName, permissions)
//     //     return permissions
//     // }
// }

// applyMixins(Core, [
//     EventDispatcher, // 事件分发器优先混入
//     PluginManager    // 插件管理器后加载
// ]);

// export default Core;
