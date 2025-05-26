import * as THREE from 'three'
import { BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'
// WebGPURenderer 暂时注释，避免外部依赖
// import WebGPURenderer from "three/examples/jsm/renderers/webgpu/WebGPURenderer";

export class WebGLContextLose extends BasePlugin {
    private renderer: any;  // 使用 any 替代 WebGPURenderer
    private scene: THREE.Scene;
    private camera: THREE.Camera;


    constructor(meta: any) {
        super(meta);
        this.renderer = meta.userData.renderer;
        this.scene = meta.userData.scene;
        this.camera = meta.userData.camera;
    }

    // 响应webgl渲染上下文丢失的情况
    private handleContextLost = () => {
        console.log("WebGL context lost");
        // 处理上下文丢失的逻辑，例如重新创建上下文、重置状态等
        this.renderer.dispose(); // 释放渲染器资源
        this.renderer = new THREE.WebGLRenderer(); // 重新创建渲染器（使用 WebGLRenderer 替代）
        this.renderer.setSize(window.innerWidth, window.innerHeight); // 设置渲染器大小
        this.renderer.setPixelRatio(window.devicePixelRatio); // 设置像素比
        this.renderer.setAnimationLoop(() => { // 设置动画循环
            this.renderer.render(this.scene, this.camera); // 重新渲染
        });
    }

    // 响应内存溢出导致程序崩溃的情况
    private handleOutOfMemory = () => {
        console.log("Out of memory");
        // 处理内存溢出的逻辑，例如释放不必要的资源、缩小场景等
        this.scene.traverse((object: THREE.Object3D) => { // 遍历场景中的所有对象
            if (object instanceof THREE.Mesh) { // 如果是网格对象
                object.geometry.dispose(); // 释放几何体
                object.material.dispose(); // 释放材质
            }
        });

        this.scene = new THREE.Scene(); // 重新创建场景
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); // 重新创建相机
        this.camera.position.set(0, 0, 5); // 设置相机位置
        this.camera.lookAt(0, 0, 0); // 设置相机朝向
        this.renderer.setSize(window.innerWidth, window.innerHeight); // 设置渲染器大小
        this.renderer.setPixelRatio(window.devicePixelRatio); // 设置像素比
        this.renderer.setAnimationLoop(() => { // 设置动画循环
            this.renderer.render(this.scene, this.camera); // 重新渲染
        });
        
    }

    // 响应渲染进程阻塞导致程序卡顿的情况
    private handleRenderBlock = () => {
        console.log("Render block");
        // 处理渲染进程阻塞的逻辑，例如使用requestAnimationFrame代替setAnimationLoop等
        const render = () => { // 定义渲染函数
            requestAnimationFrame(render); // 请求下一帧渲染
            this.renderer.render(this.scene, this.camera); // 重新渲染
        }
        render(); // 开始渲染
    }
 
}