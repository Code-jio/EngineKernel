const engine = new EngineKernel.BaseCore({
    pluginsParams: [
        {
            name: "ResourceReaderPlugin",
            path: "/plugins/ResourceReaderPlugin",
            supportedFormats: ["gltf", "fbx"],
            pluginClass: EngineKernel.ResourceReaderPlugin,
            userData: {
                url: "/public",
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
}).register({
    name: "LayerManager",
    path: "/plugins/webgl/layerManager",
    pluginClass: EngineKernel.LayerManager,
    userData: {},
})

let baseScene = engine.getPlugin("BaseScene")
console.log("🚀 ~ engine:", engine)
console.log(baseScene, "基础场景插件")

engine.register({
    name: "orbitControl",
    path: "/plugin/webgl/renderLoop",
    pluginClass: EngineKernel.orbitControls,
    userData: {
        camera: baseScene.camera,
        domElement: baseScene.renderer.domElement,
    },
}).register({
    name: "SkyBoxPlugin",
    path: "/plugins/webgl/skyBox",
    pluginClass: EngineKernel.SkyBox,
    userData: {
        scene: baseScene.scene,      // 传递场景
        camera: baseScene.camera,    // 传递相机
        renderer: baseScene.renderer,// 传递渲染器
        skyBoxType: EngineKernel.SkyBoxType.PROCEDURAL_SKY,
    },
})

engine.on("init-complete", () => {
    const orbitControl = engine.getPlugin("orbitControl")

    // 监听相机移动事件
    EngineKernel.eventBus.on("camera-moved", () => {
        const distance = orbitControl.getDistanceFromCenter()
        if (distance > 18000) {
            console.log(`警告：相机接近边界，距离: ${distance.toFixed(2)}`)
        }
    })

    // 启动轨道控制器更新
    orbitControl.update()
    // 渲染循环
    engine.getPlugin("RenderLoopPlugin").initialize()
})
