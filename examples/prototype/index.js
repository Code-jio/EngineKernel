const engine = new EngineKernel.Core({
    pluginsParams: [
        {
            name: "CameraPlugin",
            path: "/plugins/camera",
            pluginClass: EngineKernel.CameraPlugin,
            userData: {
                cameraConfig: {
                    type: "perspective",
                    fov: 45,
                    near: 0.1,
                    far: 1000,
                    position: [0, 0, 5],
                    lookAt: [0, 0, 0],
                },
            },
        },
        {
            name: "ResourceReaderPlugin",
            path: "/plugins/ResourceReaderPlugin",
            basePath: "/assets/models",
            url: "/assets/models",
            supportedFormats: ["gltf", "fbx"],
            pluginClass: EngineKernel.ResourceReaderPlugin,
            userData: {
                
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
                    clearColor: 0x444444
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
                        intensity: 0.5
                    },
                    directionalLight: {
                        color: 0xffffff,
                        intensity: 1,
                        position: [10, 10, 10]
                    }
                }
            },
        },
    ],
}).registerPlugin({
    name: "RenderLoopPlugin",
    path: "/plugins/webgl/renderLoop",
    pluginClass: EngineKernel.RenderLoop,
    userData: {},
})

let baseScene = engine.getPlugin("BaseScene")

engine.registerPlugin({
    name:"orbitControl",
    path:"/plugin/webgl/renderLoop",
    pluginClass:EngineKernel.orbitControls,
    userData:{
        camera:baseScene.camera,
        domElement:baseScene.renderer.domElement
    } 
})

engine.eventBus.on("init-complete", () => {
    let gltfLoader = engine.getPlugin('ResourceReaderPlugin').gltfLoader;

    gltfLoader.load('./model/Horse.glb', (gltf) => {
        console.log("gltf", gltf)
        gltf.scene.scale.set(0.01, 0.01, 0.01); // 调整模型大小
        gltf.scene.position.set(0, 0, 0);
        
        // 调试模型材质
        gltf.scene.traverse(child => {
            if (child.material) {
                child.material.needsUpdate = true;
            }
        });

        // 添加模型到场景
        engine.getPlugin("BaseScene").scene.add(gltf.scene);
    })

    // 渲染循环
    engine.getPlugin("RenderLoopPlugin").initialize()
})