import eventBus from "@/eventBus/eventBus.ts"
import PluginManager from "./pluginManager.js"
import { BasePlugin } from "@/plugins/basePlugin.ts"
import { isValidPath } from "@/utils/pathUtils.ts"
import { validatePlugin } from "@/utils/security.ts"

import PluginSandbox from "@/utils/sandbox.js"

export default class Core {
    static STATUS = {
        REGISTERED: "registered",
        LOADING: "loading",
        LOADED: "loaded",
        ERROR: "error",
        UNLOADING: "unloading",
    }

    constructor(dependencies = {}) {
        this.pluginRegistry = new Map() // 插件注册表
        this.eventBus = dependencies.eventBus || eventBus
        this.pluginManager = dependencies.pluginManager || new PluginManager()
        this.loadStrategies = {
            sync: this._loadSync.bind(this),
            async: this._loadAsync.bind(this),
        }
        this._messageChannels = new Map() // 消息通道
        this.performance = {
            metrics: new Map(),
            enable: true,
        }
        this.components = new Map() // 组件注册表
        this._servicePermissions = new Map() // 服务权限
    }

    // 注册
    registerPlugin(pluginMeta) {
        this.eventBus.emit("beforePluginRegister", pluginMeta)

        if (this.pluginRegistry.has(pluginMeta.name)) {
            const error = new Error(`Plugin ${pluginMeta.name} already registered`)
            this.eventBus.emit("registrationError", { meta: pluginMeta, error })
            throw error
        }

        try {
            const plugin = new BasePlugin(pluginMeta)
            this.pluginRegistry.set(plugin.name, plugin)
            // 添加带校验的注册事件
            this.eventBus.emit("pluginRegistered", {
                name: plugin.name,
                version: plugin.version,
                dependencies: plugin.dependencies,
            })
            return true
        } catch (error) {
            this.eventBus.emit("registrationError", { meta: pluginMeta, error })
            throw new Error(`Plugin registration failed: ${error.message}`)
        }
    }

    // 加载
    async loadPlugin(pluginName) {
        const plugin = this.pluginRegistry.get(pluginName)
        plugin.status = Core.STATUS.LOADING

        if (!plugin) {
            const error = new Error(`Plugin ${pluginName} not registered`)
            this.eventBus.emit("loadError", { pluginName, error })
            throw error
        }

        const sandbox = new PluginSandbox(pluginName, this)
        plugin.sandbox = sandbox // 存储沙盒实例到插件实例中
        const perfMark = `pluginLoad:${pluginName}`
        performance.mark(perfMark)

        try {
            const pluginCode = await this.pluginManager.fetchPluginCode(plugin)
            plugin.exports = sandbox.execute(pluginCode)
            plugin.interface = this._createPluginInterfaceProxy(plugin)

            // 添加加载前事件
            this.eventBus.emit("beforePluginLoad", pluginName)
            await this.loadStrategies[plugin.strategy](plugin)

            // 添加初始化后事件
            plugin.status = "loaded"
            this.eventBus.emit("pluginInitialized", {
                name: pluginName,
                exports: plugin.instance.getExports?.() || null,
            })
            performance.measure(perfMark)
        } catch (error) {
            this.eventBus.emit("loadError", {
                pluginName,
                error,
                stack: error.stack,
            })
            plugin.status = Core.STATUS.ERROR
            this._rollbackPluginLoad(plugin) // 回滚
            throw error
        }
    }

    // 卸载
    unregisterPlugin(pluginName) {
        // 添加前置检查事件
        this.eventBus.emit("beforePluginUnregister", pluginName)

        if (!this.pluginRegistry.has(pluginName)) {
            this.eventBus.emit("unregisterWarning", `Attempt to unregister non-existent plugin: ${pluginName}`)
            return false
        }

        const plugin = this.pluginRegistry.get(pluginName)
        try {
            // 添加卸载前事件
            this.eventBus.emit("beforePluginUnload", plugin)
            this._unload(plugin)

            this.pluginRegistry.delete(pluginName)
            this.eventBus.emit("pluginUnregistered", {
                name: pluginName,
                timestamp: Date.now(),
            })
            return true
        } catch (error) {
            this.eventBus.emit("unloadError", { plugin, error })
            return false
        }
    }

    // 同步加载策略
    async _loadSync(plugin) {
        return this._withPerfMonitoring("loadSync", async () => {
            if (!validatePlugin(plugin)) {
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
    async _loadAsync(plugin) {
        if (!validatePlugin(plugin)) {
            throw new Error("Invalid plugin")
        }
        if (!isValidPath(plugin.path)) {
            throw new Error("Invalid plugin path")
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement("script")
            script.src = plugin.path
            script.onload = () => {
                plugin.instance = window[plugin.name]
                plugin.instance?.initialize?.(this)
                resolve()
            }
            script.onerror = e => reject(new Error(`Failed to load ${plugin.name}: ${e.message}`))
            document.head.appendChild(script)
        })
    }

    // 卸载插件实例
    _unload(plugin) {
        plugin.instance?.uninstall?.()
        plugin.instance = null
        plugin.status = Core.STATUS.UNLOADING
    }

    // 创建插件接口代理
    _createPluginInterfaceProxy(plugin) {
        return new Proxy(plugin.exports, {
            get: (target, prop) => {
                if (prop === "registerComponent") {
                    return (name, instance) => {
                        this.components.set(name, instance)
                        this.eventBus.emit("componentRegistered", name)
                    }
                }
                if (prop === "getCoreService") {
                    return serviceName => {
                        // 安全访问其他插件服务
                        if (!this._isServiceAllowed(plugin.name, serviceName)) {
                            throw new Error(`Access to ${serviceName} is forbidden`)
                        }
                        return this.components.get(serviceName)
                    }
                }
                if (typeof target[prop] === "function") {
                    return (...args) => {
                        this.logger.log(`[${plugin.name}] Calling ${prop}`)
                        return target[prop](...args)
                    }
                }
                return target[prop]
            },
        })
    }

    // 消息通道
    createMessageChannel(channelName) {
        const channel = {
            postMessage: data => this._validateMessage(data),
            onmessage: null,
        }
        this._messageChannels.set(channelName, channel)
        return channel
    }

    // 消息验证
    _validateMessage(data) {
        // 验证消息数据大小和类型
        if (JSON.stringify(data).length > 1024) {
            throw new Error("Message payload exceeds limit")
        }
    }

    // 回滚
    _rollbackPluginLoad(plugin) {
        plugin.sandbox?.cleanup()
        this.pluginRegistry.delete(plugin.name)
    }

    // 装饰器
    _withPerfMonitoring(methodName, fn) {
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
                    error: error.message,
                    success: false,
                })
                throw error
            }
        }
    }

    // 记录性能指标
    _recordMetrics(methodName, data) {
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
    _monitorGLResources(gl, pluginName) {
        const proxy = new Proxy(gl, {
            get: (target, prop) => {
                const methodsToTrack = {
                    createTexture: "texture",
                    createBuffer: "buffer",
                    createFramebuffer: "framebuffer",
                }

                if (methodsToTrack[prop]) {
                    return (...args) => {
                        const resource = target[prop](...args)
                        this._trackGLResource(pluginName, methodsToTrack[prop], resource)
                        return resource
                    }
                }
                return target[prop]
            },
        })

        plugin.instance.setGLContext(proxy)
    }

    _trackGLResource(pluginName, type, resource) {
        const stats = this.performance.metrics.get("gpuResources") || {}
        stats[pluginName] = stats[pluginName] || { textures: 0, buffers: 0, framebuffers: 0 }
        stats[pluginName][`${type}s`]++
        this.performance.metrics.set("gpuResources", stats)
    }

    // 获取组件
    getComponent(name) {
        if (!this.components.has(name)) {
            throw new Error(`Component ${name} not registered`)
        }
        return this.components.get(name)
    }

    // 服务白名单验证
    _isServiceAllowed(requester, serviceName) {
        // 检查服务是否在白名单中
        // const serviceMap = {
        //     // eg：
        //     renderer: ["renderer", "camera", "scene"], // 允许渲染器访问渲染器、相机和场景
        // }
        return this._servicePermissions.get(requester)?.includes(serviceName) || false;
    }

    // 新增服务权限配置方法
    configureServicePermissions(pluginName, allowedServices) {
        this._servicePermissions.set(pluginName, allowedServices)
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
