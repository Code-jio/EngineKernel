// 示例插件开发模板
const ExamplePlugin = {
    meta: {
        name: "example",
        version: "1.0.0",
        dependencies: {},
        strategy: "async",
    },

    initialize(core) {
        console.log("示例插件初始化成功")
        core.eventBus.emit("examplePluginReady")
    },

    // 示例导出方法
    getExports() {
        return {
            sayHello: () => "Hello from Example Plugin",
        }
    },
}

export default ExamplePlugin
