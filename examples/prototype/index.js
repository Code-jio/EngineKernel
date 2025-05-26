let engine = window.EngineKernel
console.log(engine, "engine");
// // 创建引擎实例
// const engine = new EngineKernel.BaseCore({
//     pluginsParams: [
//         {
//             name: "ResourceReaderPlugin",
//             path: "/plugins/ResourceReaderPlugin",
//             supportedFormats: ["gltf", "glb"],
//             pluginClass: EngineKernel.ResourceReaderPlugin,
//             userData: {
//                 url: "./public",
//                 maxConcurrent: 4, // 最大并发加载数
//             },
//         },
//         {
//             name: "BaseScene",
//             path: "/plugins/scene",
//             pluginClass: EngineKernel.BaseScene,
//             userData: {
//                 rendererConfig: {
//                     container: document.getElementById("container"),
//                 }
//             },
//         },
//     ],
// }).register({
//     name: "RenderLoopPlugin",
//     path: "/plugins/webgl/renderLoop",
//     pluginClass: EngineKernel.RenderLoop,
//     userData: {},
// });

// let baseScene = engine.getPlugin("BaseScene");
// let resourceLoader = engine.getPlugin("ResourceReaderPlugin");

// // 注册控制器
// engine.register({
//     name: "orbitControl",
//     path: "/plugin/webgl/renderLoop",
//     pluginClass: EngineKernel.orbitControls,
//     userData: {
//         camera: baseScene.camera,
//         domElement: baseScene.renderer.domElement,
//     },
// });

// // 手动初始化引擎（新的方式）
// engine.initialize().then(() => {
//     console.log("🎉 引擎初始化完成");
    
//     let gltfLoader = engine.getPlugin("ResourceReaderPlugin").gltfLoader;

//     gltfLoader.load("./public/model/Horse.glb", 
//         // 成功回调
//         gltf => {
//             console.log("✅ 模型加载成功:", gltf);
            
//             // 调整模型
//             gltf.scene.scale.set(0.01, 0.01, 0.01);
//             gltf.scene.position.set(0, 0, 0);

//             // 调试模型材质
//             gltf.scene.traverse(child => {
//                 if (child.material) {
//                     child.material.needsUpdate = true;
//                 }
//             });

//             // 添加模型到场景
//             engine.getPlugin("BaseScene").scene.add(gltf.scene);
//         }
//     );

//     // 启动渲染循环
//     engine.getPlugin("RenderLoopPlugin").initialize();
// });

// // 保留原有的事件监听作为备用
// engine.on("init-complete", () => {
//     console.log("📢 收到 init-complete 事件");
// });

