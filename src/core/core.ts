// 假设 eventBus 位于项目根目录下的 eventBus 文件夹，可尝试使用相对路径引入
// 如果 eventBus 确实存在，需要确保路径正确，或者在 tsconfig.json 中配置路径别名
// 这里暂时使用相对路径示例，你需要根据实际项目结构调整
import eventBus from "../eventBus/eventBus"
import { BasePlugin } from "../plugins/basePlugin"
import { isValidPath } from "../utils/pathUtils"
import { validatePlugin } from "../utils/security"

import { CoreType, EventBus, PluginInstance } from "../types/core"
import PluginManager from "./pluginManager"
import { PluginMeta, Plugin } from "../types/Plugin"

interface CoreDependencies {
    eventBus?: EventBus
    pluginManager?: PluginManager
}

export default class Core implements CoreType {
    static STATUS = {
        REGISTERED: "registered",
        LOADING: "loading",
        LOADED: "loaded",
        ERROR: "error",
        UNLOADING: "unloading",
    }
    pluginRegistry: Map<string, PluginInstance>
    eventBus: EventBus
    pluginManager: PluginManager
    loadStrategies: { [key: string]: (plugin: PluginInstance) => Promise<void> }
    performance: { metrics: Map<string, any>; enable: boolean }
    components: any
    _messageChannels: any
    _servicePermissions: any
    private logger = console
    gpuManager: any

    constructor(dependencies: Partial<CoreDependencies> = {}) {
        this.pluginRegistry = new Map() // 插件注册表
        // 为 dependencies 参数添加类型断言，确保可以访问 eventBus 属性
        this.eventBus = (dependencies as { eventBus?: EventBus }).eventBus || eventBus
        this.pluginManager =
            (dependencies as { pluginManager?: PluginManager }).pluginManager || new PluginManager(this)
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
    }

    getPlugin(name: string): PluginInstance | undefined {
        throw new Error("Method not implemented.")
    }

    // 注册
    registerPlugin(pluginMeta: PluginMeta) {
        this.eventBus.emit("beforePluginRegister", pluginMeta)

        if (this.pluginRegistry.has(pluginMeta.name)) {
            const error = new Error(`Plugin ${pluginMeta.name} already registered`)
            this.eventBus.emit("registrationError", { meta: pluginMeta, error })
            throw error
        }

        try {
            const plugin: PluginInstance = {
                name: pluginMeta.name,
                path: pluginMeta.path,
                dependencies: pluginMeta.dependencies || [],
                strategy: pluginMeta.strategy || 'sync',
                pluginClass: pluginMeta.pluginClass || null,
                pluginMeta: pluginMeta,
                status: Core.STATUS.REGISTERED,
                exports: {},
                instance: null,
                version: pluginMeta.version || "1.0.0",
                initialize: () => void 0,
                start: () => Promise.resolve(),
                stop: () => void 0,
                interface: {} as Record<string, any>,
            }
            this.pluginRegistry.set(plugin.name, plugin)
            // 添加带校验的注册事件
            this.eventBus.emit("pluginRegistered", {
                name: plugin.name,
                version: pluginMeta.version,
                dependencies: plugin.dependencies,
            })
            return true
        } catch (error) {
            this.eventBus.emit("registrationError", { meta: pluginMeta, error })
            throw new Error(`Plugin registration failed: ${(error as Error).message}`)
        }
    }

    // 加载
    async loadPlugin(pluginName: string) {
        const plugin = this.pluginRegistry.get(pluginName) as PluginInstance
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`)
        }
        plugin.status = Core.STATUS.LOADING

        if (!plugin) {
            const error = new Error(`Plugin ${pluginName} not registered`)
            this.eventBus.emit("loadError", { pluginName, error })
            throw error
        }

        const perfMark = `pluginLoad:${pluginName}`
        performance.mark(perfMark)

        try {
            const pluginCode = await this.pluginManager.fetchPluginCode(plugin)
            const module = await import(/* webpackIgnore: true */ plugin.path)
            plugin.instance = module.default ? new module.default(this) : module
            plugin.exports = plugin.exports || {}
            plugin.interface = this._createPluginInterfaceProxy(plugin)

            // 添加加载前事件
            this.eventBus.emit("beforePluginLoad", pluginName)
            await this.loadStrategies[plugin.strategy](plugin)

            // 添加初始化后事件
            plugin.status = "loaded"
            this.eventBus.emit("pluginInitialized", {
                name: pluginName,
                exports: plugin.exports,
            })
            performance.measure(perfMark)
        } catch (error) {
            this.eventBus.emit("loadError", {
                pluginName,
                error,
                stack: error instanceof Error ? error.stack : undefined,
            })
            plugin.status = Core.STATUS.ERROR
            this._rollbackPluginLoad(plugin) // 回滚
            throw error
        }
    }

    // 卸载
    unregisterPlugin(plugin: PluginInstance) {
        // 添加前置检查事件
        this.eventBus.emit("beforePluginUnregister", plugin.name)

        if (!this.pluginRegistry.has(plugin.name)) {
            this.eventBus.emit("unregisterWarning", `Attempt to unregister non-existent plugin: ${plugin.name}`)
            return false
        }

        try {
            // 添加卸载前事件
            this.eventBus.emit("beforePluginUnload", plugin)
            this._unload(plugin)

            this.pluginRegistry.delete(plugin.name)
            this.eventBus.emit("pluginUnregistered", {
                name: plugin.name,
                timestamp: Date.now(),
            })
            return true
        } catch (error) {
            this.eventBus.emit("unloadError", { plugin, error })
            return false
        }
    }

    // 同步加载策略
    async _loadSync(plugin: PluginInstance) {
        return this._withPerfMonitoring("loadSync", async () => {
            if (!validatePlugin(plugin as PluginMeta)) {
                throw new Error("Invalid plugin")
            }
            if (!isValidPath(plugin.path)) {
                throw new Error("Invalid plugin path")
            }
            const module = await import(/* webpackIgnore: true */ plugin.path)
            plugin.instance = module.default ? new module.default(this) : module
            plugin.instance.initialize?.()
        })()
    }

    // 异步加载策略
    async _loadAsync(plugin: PluginInstance): Promise<void> {
        if (!validatePlugin(plugin as PluginMeta)) {
            throw new Error("Invalid plugin")
        }
        if (!isValidPath(plugin.path)) {
            throw new Error("Invalid plugin path")
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement("script") as HTMLScriptElement
            script.src = plugin.path
            script.onload = () => {
                plugin.instance = (window as unknown as { [key: string]: any })[plugin.name]
                plugin.instance?.initialize?.(this)
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
        plugin.instance?.uninstall?.()
        plugin.instance = null
        plugin.status = Core.STATUS.UNLOADING
    }

    // 创建插件接口代理
    _createPluginInterfaceProxy(plugin: PluginInstance) {
        return new Proxy(plugin.exports, {
            get: (target: any, prop: string | symbol) => {
                if (prop === "registerComponent") {
                    return (name: string, instance: unknown) => {
                        this.components.set(name, instance)
                        this.eventBus.emit("componentRegistered", name)
                    }
                }
                if (prop === "getCoreService") {
                    return (serviceName: string) => {
                        // 安全访问其他插件服务
                        if (!this._isServiceAllowed(plugin.name, serviceName)) {
                            throw new Error(`Access to ${serviceName} is forbidden`)
                        }
                        return this.components.get(serviceName)
                    }
                }
                if (typeof target[prop] === "function") {
                    return (...args: any[]) => {
                        this.logger.log(`[${plugin.name}] Calling ${String(prop)}`)
                        return target[prop](...args)
                    }
                }
                return target[prop as keyof typeof target]
            },
        })
    }

    // 回滚
    _rollbackPluginLoad(plugin: PluginInstance) {
        this.pluginRegistry.delete(plugin.name)
    }

    // 装饰器
    private _withPerfMonitoring<T>(
        methodName: string,
        fn: (...args: any[]) => Promise<T>,
    ): (...args: any[]) => Promise<T> {
        return async (...args) => {
            if (!this.performance.enable) return fn(...args)

            const start = performance.now()
            const memBefore = process.memoryUsage().rss

            try {
                const result = await fn(...args)
                const duration = performance.now() - start
                const memDelta = process.memoryUsage().rss - memBefore

                this._recordMetrics(methodName, {
                    duration,
                    memoryDelta: memDelta,
                    success: true,
                })

                return result
            } catch (error) {
                this._recordMetrics(methodName, {
                    duration: performance.now() - start,
                    error: (error as Error).message,
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
        this.eventBus.emit("performanceMetrics", { methodName, ...data })
    }

    // GPU资源追踪
    _monitorGLResources(gl: WebGL2RenderingContext & any, pluginName: string) {
        const methodsToTrack = {
            createTexture: "createTexture",
            createBuffer: "createBuffer",
            createFramebuffer: "createFramebuffer",
        } as Record<keyof WebGL2RenderingContext, string>

        const proxy = new Proxy<WebGL2RenderingContext>(gl as unknown as WebGL2RenderingContext, {
            get: (target, prop) => {
                if (prop in target && methodsToTrack.hasOwnProperty(prop)) {
                    const method = target[prop as keyof WebGL2RenderingContext] as (...args: number[]) => any
                    return (...args: number[]) => {
                        const resource = method.call(target, ...args)
                        this._trackGLResource(pluginName, prop as keyof WebGL2RenderingContext, resource)
                        return resource
                    }
                }
                return target[prop as keyof typeof target]
            },
        })

        this.pluginRegistry.get(pluginName)?.instance.setGLContext?.(proxy as unknown as WebGL2RenderingContext & typeof gl)
    }

    _trackGLResource(pluginName: string, type: keyof WebGL2RenderingContext, resource: any) {
        const stats = this.performance.metrics.get("gpuResources") || {}
        stats[pluginName] = stats[pluginName] || { textures: 0, buffers: 0, framebuffers: 0 }
        stats[pluginName][String(type)]++
        this.performance.metrics.set("gpuResources", stats)
    }

    // 获取组件
    getComponent(name: string) {
        if (!this.components.has(name)) {
            throw new Error(`Component ${name} not registered`)
        }
        return this.components.get(name)
    }

    // 服务白名单验证
    _isServiceAllowed(requester: string, serviceName: string) {
        return this._servicePermissions.get(requester)?.includes(serviceName) || false
    }

    // 新增服务权限配置方法
    configureServicePermissions<T extends any[]>(pluginName: string, permissions: T): T {
        this._servicePermissions.set(pluginName, permissions)
        return permissions
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
