// 确保使用EngineKernel提供的THREE实例
console.log('🔍 检查THREE对象可用性...')
if (!window.EngineKernel || !window.EngineKernel.THREE) {
    throw new Error('❌ EngineKernel.THREE 不可用，请确保正确加载了engine-kernel.dev.js')
}

// 将EngineKernel.THREE设为本地THREE引用，方便使用
const THREE = window.EngineKernel.THREE
console.log('✅ THREE对象已正确初始化:', THREE)

const engine = new EngineKernel.BaseCore({
    pluginsParams: [
        {
            name: "ResourceReaderPlugin",
            path: "/plugins/ResourceReaderPlugin",
            supportedFormats: ["gltf", "glb"],
            pluginClass: EngineKernel.ResourceReaderPlugin,
            userData: {
                url: "./public",
                maxConcurrent: 4, // 最大并发加载数
            },
        },
        {
            name: "BaseScene",
            path: "/plugins/scene",
            pluginClass: EngineKernel.BaseScene,
            userData: {
                rendererConfig: {
                    container: document.getElementById("container"),
                },
            },
        },
    ],
}).register({
    name: "RenderLoopPlugin",
    path: "/plugins/webgl/renderLoop",
    pluginClass: EngineKernel.RenderLoop,
    userData: {},
})

let baseScene = engine.getPlugin("BaseScene")
let resourceLoader = engine.getPlugin("ResourceReaderPlugin")

console.log("🚀 ~ engine:", engine)
console.log(baseScene, "基础场景插件")
console.log(resourceLoader, "资源加载插件")

engine.register({
    name: "orbitControl",
    path: "/plugin/webgl/renderLoop",
    pluginClass: EngineKernel.orbitControls,
    userData: {
        camera: baseScene.camera,
        domElement: baseScene.renderer.domElement,
    },
})

// 监听资源加载事件
engine.on("resource-loaded", (result) => {
    console.log(`资源 "${result.name}" 加载完成`, result)
    
    if (result.type === 'gltf') {
        const gltf = result.data
        // 调整模型
        gltf.scene.scale.set(0.01, 0.01, 0.01)
        gltf.scene.position.set(0, -1.5, 0)
        
        // 添加模型到场景
        baseScene.scene.add(gltf.scene)
        console.log("模型已添加到场景",baseScene.scene)
    }
})

engine.on("init-complete", async () => {
    // 启动渲染循环
    engine.getPlugin("RenderLoopPlugin").initialize()
})
