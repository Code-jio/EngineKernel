import eventBus from "../eventBus/eventBus"
import { BasePlugin } from "../plugins/basePlugin"
import { isValidPath } from "../utils/pathUtils"
import { validatePlugin } from "../utils/security"

import { CoreType, PluginInstance } from "../types/core"
import PluginManager from "./pluginManager"
import { PluginMeta, Plugin } from "../types/Plugin"

import { EventDispatcher } from "../eventBus/eventDispatch"
import { applyMixins } from "../decorators/mixinGuards"

// 定义 Core 类的依赖项接口
export interface InitParams {
    pluginsParams: []
}

// 定义公共接口
export interface IBaseCore {
    getPlugin(name: string): any;
    register(pluginMeta: PluginMeta): BaseCore;
    unregisterPlugin(plugin: PluginInstance): boolean;
}

// 基础核心类声明
class BaseCore implements IBaseCore {
    static STATUS = {
        REGISTERED: "registered",
        LOADING: "loading",
        LOADED: "loaded",
        ERROR: "error",
        UNLOADING: "unloading",
    }
    protected loadStrategies: { [key: string]: (plugin: PluginInstance) => Promise<void> } // 加载策略
    protected performance: { metrics: Map<string, any>; enable: boolean } // 后续转为性能表现的插件
    protected components: any // 
    protected _messageChannels: any // 
    protected _servicePermissions: any // 
    protected logger = console

    protected gpuManager: any // 后续移除，转变成对应插件
    
    constructor(InitParams: InitParams) {
        this.loadStrategies = {
            sync: this._loadSync.bind(this),
            async: this._loadAsync.bind(this),
        }

        this.performance = {
            metrics: new Map(),
            enable: true,
        }
        this.components = new Map() // 组件注册表
        this._messageChannels = new Map() // 消息通道注册表
        this._servicePermissions = new Map() // 服务权限
        // super();
        this.listeners = new Map<string, Array<Function>>()

        this.registry = new Map<
            string,
            {
                instance: PluginInstance
                metadata: {
                    name: string
                    version: string
                    status: "registered" | "loaded" | "initialized" | "activated" // 注册 | 加载 | 初始化 | 运行中
                    dependencies: string[] // 依赖项
                }
            }
        >()
        this._startAsyncInit(InitParams)
    }

    protected async _startAsyncInit(InitParams: InitParams) {
        if (InitParams.pluginsParams) {
            for (const params of InitParams.pluginsParams) {
                if (params) {
                    this.register(params)
                }
            }
        }

        await this._initPlugins()
    }

    protected async _initPlugins() {
        let that: CoreType = this as any
        const plugins = Array.from(this.registry.values())
        await Promise.all(plugins.map(p => p.instance.initialize?.(that)))
        this.emit("init-complete")
    }

    getPlugin(name: string): any {
        // return this.getPlugin(name)
        return this.registry.get(name)?.instance
    }

    // 注册
    register(pluginMeta: PluginMeta) {
        this.emit("beforePluginRegister", pluginMeta)

        if (this.hasPlugin(pluginMeta.name)) {
            const error = new Error(`插件 ${pluginMeta.name} 已经注册了`)
            this.emit("PluginRegisterError", { meta: pluginMeta, error })
            console.error(`插件 ${pluginMeta.name} 已经注册了`, error)
        }
        try {
            // 强制校验插件类定义
            if (!pluginMeta.pluginClass) {
                console.error("插件类未定义")
            }
            if (typeof pluginMeta.pluginClass !== "function") {
                console.error(`插件类必须是一个构造函数。收到的类型: ${typeof pluginMeta.pluginClass}`)
            }
            if (!(pluginMeta.pluginClass.prototype instanceof BasePlugin)) {
                console.error("插件类必须继承自BasePlugin")
            }

            // 添加路径校验逻辑
            if (!isValidPath(pluginMeta.path)) {
                throw new Error(`Invalid plugin path: ${pluginMeta.path}`)
            }

            // // 记录详细注册日志
            // this.logger.debug(`Registering plugin: ${pluginMeta.name}`, {
            //     path: pluginMeta.path,
            //     dependencies: pluginMeta.dependencies
            // });

            const plugin: PluginInstance = new pluginMeta.pluginClass({
                name: pluginMeta.name,
                path: pluginMeta.path,
                dependencies: pluginMeta.dependencies || [],
                strategy: pluginMeta.strategy || "sync",
                userData: pluginMeta.userData,
            })
            plugin.status = BaseCore.STATUS.REGISTERED

            this.registerPlugin(plugin)
            // 添加带校验的注册事件
            this.emit("pluginRegistered", {
                name: plugin.name,
                version: pluginMeta.version,
                dependencies: plugin.dependencies,
                instaance: plugin,
            })
            return this
        } catch (error) {
            this.emit("registrationError", { meta: pluginMeta, error })
            console.error("插件注册失败", {
                name: pluginMeta.name,
                path: pluginMeta.path,
                error: error instanceof Error ? error.message : error
            })
            return this
        }
    }

    // // 加载
    // async loadPlugin(pluginName: string) {
    //     const plugin = this.getPlugin(pluginName)
    //     if (!plugin) {
    //         // throw new Error(`Plugin ${pluginName} not found`)
    //         console.error(`插件 ${pluginName} 未找到`)
    //         return false
    //     }
    //     plugin.status = Core.STATUS.LOADING

    //     if (!plugin) {
    //         const error = new Error(`插件 ${pluginName} 未注册`)
    //         this.emit("loadError", { pluginName, error })
    //         throw error
    //     }

    //     const perfMark = `pluginLoad:${pluginName}`
    //     performance.mark(perfMark)

    //     try {
    //         const pluginCode = await this.fetchPluginCode(plugin)
    //         const module = await import(/* webpackIgnore: true */ plugin.path)
    //         plugin.instance = module.default ? new module.default(this) : module
    //         plugin.exports = plugin.exports || {}
    //         // plugin.interface = this._createPluginInterfaceProxy(plugin) // 创建插件接口代理

    //         // 添加加载前事件
    //         this.emit("beforePluginLoad", pluginName)
    //         await this.loadStrategies[plugin.strategy](plugin)

    //         // 添加初始化后事件
    //         plugin.status = "loaded"
    //         this.emit("pluginInitialized", {
    //             name: pluginName,
    //             exports: plugin.exports,
    //         })
    //         performance.measure(perfMark)
    //     } catch (error) {
    //         this.emit("loadError", {
    //             pluginName,
    //             error,
    //             stack: error instanceof Error ? error.stack : undefined,
    //         })
    //         plugin.status = Core.STATUS.ERROR
    //         this._rollbackPluginLoad(plugin) // 回滚
    //         throw error
    //     }
    // }

    // 卸载
    unregisterPlugin(plugin: PluginInstance) {
        // 添加前置检查事件
        this.emit("beforePluginUnregister", plugin.name)

        if (!this.hasPlugin(plugin.name)) {
            this.emit("unregisterWarning", `Attempt to unregister non-existent plugin: ${plugin.name}`)
            return false
        }

        try {
            // 添加卸载前事件
            this.emit("beforePluginUnload", plugin)
            this._unload(plugin)

            this.unregisterPlugin(plugin)
            this.emit("pluginUnregistered", {
                name: plugin.name,
                timestamp: Date.now(),
            })
            return true
        } catch (error) {
            this.emit("unloadError", { plugin, error })
            return false
        }
    }

    // 同步加载策略
    async _loadSync(plugin: PluginInstance) {
        return this._withPerfMonitoring("loadSync", async () => {
            if (!validatePlugin(plugin as PluginMeta)) {
                console.error("非法插件", { plugin })
            }
            if (!isValidPath(plugin.path)) {
                console.error("不正确的插件路径", { plugin })
            }
            const module = await import(/* webpackIgnore: true */ plugin.path)
            plugin.instance = module.default ? new module.default(this) : module
            // plugin.instance.initialize?.() // 初始化插件
        })()
    }

    // 异步加载策略
    async _loadAsync(plugin: PluginInstance): Promise<void> {
        if (!validatePlugin(plugin as PluginMeta)) {
            console.error("非法插件", { plugin })
        }
        if (!isValidPath(plugin.path)) {
            console.error("不正确的插件路径", { plugin })
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement("script") as HTMLScriptElement
            script.src = plugin.path
            script.onload = () => {
                plugin.instance = (window as unknown as { [key: string]: any })[plugin.name]
                // plugin.instance?.initialize?.(this)
                resolve()
            }
            script.onerror = (e: Event | string) => {
                reject(new Error(`加载失败: ${e}`))
            }
            document.head.appendChild(script)
        })
    }

    // 卸载插件实例
    _unload(plugin: PluginInstance) {
        // plugin.instance?.uninstall?.()
        // plugin.instance = null
        // plugin.status = Core.STATUS.UNLOADING
    }

    // 装饰器
    protected _withPerfMonitoring<T>(
        methodName: string,
        fn: (...args: any[]) => Promise<T>,
    ): (...args: any[]) => Promise<T> {
        return async (...args) => {
            if (!this.performance.enable) return fn(...args)

            const startTime = performance.now()
            const startMemory = (performance as any).memory?.usedJSHeapSize

            try {
                const result = await fn(...args)
                const endTime = performance.now()
                const endMemory = (performance as any).memory?.usedJSHeapSize

                this._recordMetrics(methodName, {
                    duration: endTime - startTime,
                    memoryDelta: endMemory ? endMemory - startMemory : undefined,
                    success: true,
                })

                return result
            } catch (error) {
                const endTime = performance.now()
                const endMemory = (performance as any).memory?.usedJSHeapSize

                this._recordMetrics(methodName, {
                    duration: endTime - startTime,
                    memoryDelta: endMemory ? endMemory - startMemory : undefined,
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                })

                throw error
            }
        }
    }

    // 记录性能指标
    _recordMetrics(
        methodName: string,
        data: { duration: number; memoryDelta?: number; error?: string; success: boolean },
    ) {
        const entry = this.performance.metrics.get(methodName) || {
            callCount: 0, // 调用次数
            totalDuration: 0, // 总耗时
            successCount: 0, // 成功次数
            errorCount: 0, // 错误次数
            memoryChanges: [], // 内存变化
        }

        entry.callCount++
        entry.totalDuration += data.duration
        data.success ? entry.successCount++ : entry.errorCount++
        entry.memoryChanges.push(data.memoryDelta)

        this.performance.metrics.set(methodName, entry)
        this.emit("performanceMetrics", { methodName, ...data })
    }
}

// 类型合并声明
interface BaseCore extends PluginManager, EventDispatcher {}

// 调整后的混入顺序
applyMixins(BaseCore, [
    EventDispatcher, // 事件分发器优先混入
    PluginManager, // 插件管理器后加载
])

// 增强类型导出
export default BaseCore as typeof BaseCore & IBaseCore & PluginManager & EventDispatcher
