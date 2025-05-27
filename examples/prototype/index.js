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
                    antialias: true,
                    alpha: false,
                    clearColor: 0x444444,
                },
                cameraConfig: {
                    type: "perspective",
                    fov: 45,
                    near: 0.1,
                    far: 100000,  // 增加远裁剪面以适应天空盒
                    position: [500, 500, 500],  // 设置更远的初始位置
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
    let gltfLoader = engine.getPlugin("ResourceReaderPlugin").gltfLoader

    gltfLoader.load("./public/model/Horse.glb", gltf => {
        console.log("gltf", gltf)
        // gltf.scene.scale.set(0.01, 0.01, 0.01) // 调整模型大小
        // gltf.scene.position.set(0, 0, 0)

        // 调试模型材质
        gltf.scene.traverse(child => {
            if (child.material) {
                child.material.needsUpdate = true
            }
        })

        // 添加模型到场景
        engine.getPlugin("BaseScene").scene.add(gltf.scene)
    })
    // 获取轨道控制器插件
    const orbitControl = engine.getPlugin("orbitControl")
    
    // 验证相机位置设置
    console.log("=== 相机位置调试信息 ===")
    console.log(`BaseScene相机位置: [${baseScene.camera.position.x}, ${baseScene.camera.position.y}, ${baseScene.camera.position.z}]`)
    console.log(`OrbitControl相机距离中心: ${orbitControl.getDistanceFromCenter().toFixed(2)}`)
    
    // 监听相机移动事件
    EngineKernel.eventBus.on("camera-moved", () => {
        const distance = orbitControl.getDistanceFromCenter()
        // 如果距离过大，可以显示警告（这在enforceMovementBounds中已处理）
        if (distance > 18000) {
            console.log(`警告：相机接近边界，距离: ${distance.toFixed(2)}`)
        }
    })

    // 启动轨道控制器更新
    orbitControl.update()
    

    
    // 渲染循环
    engine.getPlugin("RenderLoopPlugin").initialize()
})
