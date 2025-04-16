import vm from "vm-browserify"
import { EventEmitter } from "events"

export default class PluginSandbox {
    constructor(pluginName, coreInstance) {
        this.context = vm.createContext({
            name: pluginName,
            console: this._createSafeConsole(),
            require: this._createSafeRequire(),
            _apis: this._createCoreProxy(coreInstance),
            canvas: this._createCanvasProxy(),
        })

        this.eventChannel = new EventEmitter()
        this.resources = new Set()

        // 内存监控
        this.memoryQuota = {
            maxBufferSize: 1024 * 1024 * 100, // 100MB
            allocated: 0,
        }
    }

    // 创建安全控制台（限制日志输出）
    _createSafeConsole() {
        return new Proxy(console, {
            get: (target, prop) =>
                ["log", "warn", "debug"].includes(prop) ? (...args) => target[prop](`[SANDBOX] `, ...args) : () => {},
        })
    }

    // 创建受限的require函数
    _createSafeRequire() {
        const allowedModules = ["path", "url", "util"]
        return new Proxy(require, {
            apply: (target, thisArg, args) => {
                // 强制参数必须为字符串字面量
                if (args.length !== 1 || typeof args[0] !== "string") {
                    throw new Error("Require path must be a string literal")
                }

                const moduleName = args[0]
                if (!allowedModules.includes(moduleName)) {
                    throw new Error(`Access to module ${moduleName} is restricted`)
                }

                // 返回原始模块的代理版本
                return new Proxy(target(moduleName), {
                    get: (modTarget, prop) => {
                        // 防止访问内部属性
                        if (typeof prop === "symbol" || prop.startsWith("_")) {
                            throw new Error(`Access to private property ${prop.toString()} is forbidden`)
                        }
                        return modTarget[prop]
                    },
                })
            },
            construct: () => {
                throw new Error("Require constructor is disabled")
            },
        })
    }

    // 创建核心API代理
    _createCoreProxy(core) {
        return new Proxy(core, {
            get: (target, prop) => {
                // 只允许访问特定方法
                const gpuMethods = ["createTexture", "createBuffer"]
                if (gpuMethods.includes(prop)) {
                    return params => {
                        // 添加参数校验和错误处理
                        if (!params || typeof params !== "object") {
                            throw new Error("GPU方法需要有效的配置对象")
                        }
                        if (!validateGLParams(params)) {
                            throw new Error(`无效的GPU参数: ${JSON.stringify(params)}`)
                        }
                        try {
                            return target.gpuManager[prop](params)
                        } catch (e) {
                            throw new Error(`GPU操作失败: ${e.message}`)
                        }
                    }
                }

                // if (prop === "physics") {
                //     return new Proxy(target.physics, {
                //         get: (phyTarget, phyProp) => {
                //             // 使用get代替apply
                //             if (phyProp === "simulate") {
                //                 return (...args) => {
                //                     const [steps] = args
                //                     if (steps > 1000) {
                //                         throw new Error(`模拟步数超过限制 (${steps}/1000)`)
                //                     }
                //                     return phyTarget[phyProp](...args)
                //                 }
                //             }
                //             return phyTarget[phyProp]
                //         },
                //     })
                // }

                // 加强方法白名单校验
                const allowedMethods = ["emitEvent", "getConfig"]
                if (allowedMethods.includes(prop)) {
                    if (typeof target[prop] !== "function") {
                        throw new Error(`核心方法 ${prop} 不可用`)
                    }
                    return (...args) => {
                        try {
                            return target[prop](...args)
                        } catch (e) {
                            throw new Error(`核心API调用失败: ${e.message}`)
                        }
                    }
                }

                // 明确返回undefined代替默认行为
                return undefined
            },
        })
    }

    // 创建图形上下文代理
    _createCanvasProxy() {
        return new Proxy(realCanvas, {
            set: (obj, prop, value) => {
                const allowedProps = ["width", "height"]
                if (!allowedProps.includes(prop)) {
                    throw new Error(`Canvas property ${prop} is read-only`)
                }
                return Reflect.set(obj, prop, value)
            },
            get: (obj, prop) => {
                if (prop === "getContext") {
                    return type => {
                        if (type !== "webgl2") {
                            throw new Error("Only WebGL2 context is allowed")
                        }
                        return this._createGLContextProxy(obj.getContext(type))
                    }
                }
                return obj[prop]
            },
        })
    }

    // 执行插件代码
    execute(code, timeout = 1000) {
        const script = new vm.Script(code, {
            timeout, // 1秒执行超时
            microtaskMode: "afterEvaluate",
        })

        return script.runInContext(this.context, {
            breakOnSigint: true,
        })
    }

    // 资源回收
    cleanup() {
        this.eventChannel.removeAllListeners()
        this.resources.forEach(resource => resource.release())
    }

    // 劫持ArrayBuffer申请
    _createArrayBufferProxy() {
        return new Proxy(ArrayBuffer, {
            construct: (target, args) => {
                const [size] = args
                if (this.memoryQuota.allocated + size > this.memoryQuota.maxBufferSize) {
                    throw new Error("Memory quota exceeded")
                }
                this.memoryQuota.allocated += size
                return new target(...args)
            },
        })
    }

    // 在图形上下文代理中增加着色器验证
    _createGLContextProxy(gl) {
        return new Proxy(gl, {
            get: (target, prop) => {
                if (prop === "shaderSource") {
                    return (shader, source) => {
                        if (!validateShader(source)) {
                            throw new Error("Invalid shader code detected")
                        }
                        return target.shaderSource(shader, source)
                    }
                }
                return target[prop]
            },
        })
    }
}
