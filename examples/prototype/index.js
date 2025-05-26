
console.log("🚀 ~ engine:", window.EngineKernel)
    
// const engine = new EngineKernel.BaseCore({
//     pluginsParams: [
//         {
//             name: "BaseScene",
//             path: "/plugins/scene",
//             pluginClass: EngineKernel.BaseScene,
//             userData: {
//                 rendererConfig: {
//                     container: document.getElementById("container"),
//             },
//         },
//     }
//     ],
// }).register({
//     name: "RenderLoopPlugin",
//     path: "/plugins/webgl/renderLoop",
//     pluginClass: EngineKernel.RenderLoop,
//     userData: {},
// })

// let baseScene = engine.getPlugin("BaseScene")

// engine.register({
//     name:"orbitControl",
//     path:"/plugin/webgl/renderLoop",
//     pluginClass:EngineKernel.orbitControls,
//     userData:{
//         camera:baseScene.camera,
//         domElement:baseScene.renderer.domElement
//     } 
// })

// engine.on("init-complete", () => {
//     // let gltfLoader = engine.getPlugin('ResourceReaderPlugin').gltfLoader;
    
//     // gltfLoader.load('./public/model/Horse.glb', (gltf) => {
//     //     console.log("gltf", gltf)
//     //     gltf.scene.scale.set(0.01, 0.01, 0.01); // 调整模型大小
//     //     // gltf.scene.position.set(0, 0, 0);
        
//     //     // 调试模型材质
//     //     gltf.scene.traverse(child => {
//     //         if (child.material) {
//     //             child.material.needsUpdate = true;
//     //         }
//     //     });

//     //     // 添加模型到场景
//     //     engine.getPlugin("BaseScene").scene.add(gltf.scene);
//     // })

//     // 渲染循环
//     engine.getPlugin("RenderLoopPlugin").initialize()
// })


// fetch("./public/").then((res)=>{
//     console.log(res)
// })
