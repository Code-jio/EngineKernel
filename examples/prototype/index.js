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
                    antialias: true,
                    alpha: false,
                    clearColor: 0x444444,
                },
                cameraConfig: {
                    type: "perspective",
                    fov: 45,
                    near: 0.1,
                    far: 1000,
                    position: [0, 0, 5],
                    lookAt: [0, 0, 0],
                },
                lightConfig: {
                    ambientLight: {
                        color: 0xffffff,
                        intensity: 0.5,
                    },
                    directionalLight: {
                        color: 0xffffff,
                        intensity: 1,
                        position: [10, 10, 10],
                    },
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

engine.on("init-complete", () => {
    let gltfLoader = engine.getPlugin("ResourceReaderPlugin").gltfLoader

    gltfLoader.load("./public/model/Horse.glb", gltf => {
        console.log("gltf", gltf)
        gltf.scene.scale.set(0.01, 0.01, 0.01) // 调整模型大小
        gltf.scene.position.set(0, 0, 0)

        // 调试模型材质
        gltf.scene.traverse(child => {
            if (child.material) {
                child.material.needsUpdate = true
            }
        })

        // 添加模型到场景
        engine.getPlugin("BaseScene").scene.add(gltf.scene)
    })

    // 渲染循环
    engine.getPlugin("RenderLoopPlugin").initialize()
})
