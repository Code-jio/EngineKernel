/**
 * WaterMarker 使用示例
 * 展示如何创建和使用指定轮廓的水体渲染
 */

import { WaterMarker } from '../src/plugins/webgl/waterMarker';
import { THREE } from '../src/plugins/basePlugin';

// 创建基本的THREE.js场景
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 添加光源
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 50, 50);
scene.add(directionalLight);

// 示例1：创建矩形水池
function createRectanglePool() {
    const rectangleContour = [
        new THREE.Vector3(-8, 0, -8),
        new THREE.Vector3(8, 0, -8),
        new THREE.Vector3(8, 0, 8),
        new THREE.Vector3(-8, 0, 8)
    ];

    const rectanglePool = new WaterMarker({
        height: 4,
        contour: rectangleContour,
        position: new THREE.Vector3(0, 0, 0),
        waterColor: 0x4a90e2,
        transparency: 0.8,
        reflectivity: 0.9,
        flowSpeed: 0.4,
        waveScale: 1.2,
        distortionScale: 4.0,
        enableAnimation: true
    });

    rectanglePool.addToScene(scene);
    return rectanglePool;
}

// 示例2：创建圆形水池
function createCircularPool() {
    const circularContour: THREE.Vector3[] = [];
    const radius = 6;
    const segments = 12;
    
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        circularContour.push(new THREE.Vector3(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
        ));
    }

    const circularPool = new WaterMarker({
        height: 3,
        contour: circularContour,
        position: new THREE.Vector3(20, 0, 0),
        waterColor: 0x00aaff,
        transparency: 0.7,
        reflectivity: 0.8,
        flowSpeed: 0.3,
        waveScale: 0.8,
        distortionScale: 3.0,
        enableAnimation: true
    });

    circularPool.addToScene(scene);
    return circularPool;
}

// 示例3：创建六边形水池
function createHexagonPool() {
    const hexagonContour = [
        new THREE.Vector3(5, 0, 0),
        new THREE.Vector3(2.5, 0, 4.3),
        new THREE.Vector3(-2.5, 0, 4.3),
        new THREE.Vector3(-5, 0, 0),
        new THREE.Vector3(-2.5, 0, -4.3),
        new THREE.Vector3(2.5, 0, -4.3)
    ];

    const hexagonPool = new WaterMarker({
        height: 5,
        contour: hexagonContour,
        position: new THREE.Vector3(-20, 0, 0),
        waterColor: 0x20b2aa,
        transparency: 0.75,
        reflectivity: 0.7,
        flowSpeed: 0.5,
        waveScale: 1.5,
        distortionScale: 5.0,
        enableAnimation: true
    });

    hexagonPool.addToScene(scene);
    return hexagonPool;
}

// 创建水池实例
const rectanglePool = createRectanglePool();
const circularPool = createCircularPool();
const hexagonPool = createHexagonPool();

// 设置相机位置，从高处俯视以便看到水面效果
camera.position.set(0, 25, 35);
camera.lookAt(0, 0, 0);

// 动态效果演示
function demonstrateEffects() {
    setTimeout(() => {
        rectanglePool.setWaterColor(0x00ff88);
        console.log("🎨 矩形水池颜色已更改 - 注意顶面和侧面都会改变");
    }, 3000);

    setTimeout(() => {
        circularPool.setTransparency(0.9);
        console.log("💧 圆形水池透明度已更改 - 侧面变得更透明");
    }, 5000);

    setTimeout(() => {
        hexagonPool.setWaveParameters(2.5, 7.0);
        console.log("🌊 六边形水池波浪参数已更改 - 只有顶面有波浪");
    }, 7000);
}

// 轮廓动态更新演示
function demonstrateContourUpdate() {
    setTimeout(() => {
        // 将矩形池子变成更大的矩形
        const newContour = [
            new THREE.Vector3(-12, 0, -12),
            new THREE.Vector3(12, 0, -12),
            new THREE.Vector3(12, 0, 12),
            new THREE.Vector3(-12, 0, 12)
        ];
        
        rectanglePool.updateContour(newContour);
        console.log("🔄 矩形水池轮廓已更新为更大的矩形");
    }, 10000);
}

// 渲染循环
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = 0.016; // 约60fps

    // 更新水池动画（只有顶面有波浪动画）
    rectanglePool.update(deltaTime);
    circularPool.update(deltaTime);
    hexagonPool.update(deltaTime);

    renderer.render(scene, camera);
}

// 启动示例
console.log("🚀 多材质 WaterMarker 示例开始运行");
console.log("📋 新特性:");
console.log("  - 顶面：完整的水面效果（波浪、反射、扭曲）");
console.log("  - 侧面：简单的半透明水蓝色");
console.log("  - 底面：简单的半透明水蓝色");
console.log("  - 多种形状：矩形、圆形、六边形");

// 启动动画和演示
animate();
demonstrateEffects();
demonstrateContourUpdate();

// 交互控制
document.addEventListener('keydown', (event) => {
    switch(event.key) {
        case '1':
            rectanglePool.setAnimationEnabled(!rectanglePool.getOptions().enableAnimation);
            console.log("🔄 矩形水池动画切换");
            break;
        case '2':
            circularPool.setAnimationEnabled(!circularPool.getOptions().enableAnimation);
            console.log("🔄 圆形水池动画切换");
            break;
        case '3':
            hexagonPool.setAnimationEnabled(!hexagonPool.getOptions().enableAnimation);
            console.log("🔄 六边形水池动画切换");
            break;
        case 'c':
            // 随机改变所有水池颜色
            const colors = [0x4a90e2, 0x00aaff, 0x20b2aa, 0x1e90ff, 0x00bfff];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            rectanglePool.setWaterColor(randomColor);
            circularPool.setWaterColor(randomColor);
            hexagonPool.setWaterColor(randomColor);
            console.log(`🎨 所有水池颜色已更改为: #${randomColor.toString(16)}`);
            break;
        case 't':
            // 切换透明度
            const newTransparency = Math.random() * 0.5 + 0.5; // 0.5-1.0
            rectanglePool.setTransparency(newTransparency);
            circularPool.setTransparency(newTransparency);
            hexagonPool.setTransparency(newTransparency);
            console.log(`💎 所有水池透明度已设置为: ${newTransparency.toFixed(2)}`);
            break;
    }
});

console.log("⌨️  键盘控制:");
console.log("  - 按 1/2/3 切换对应水池的动画");
console.log("  - 按 C 随机改变所有水池颜色");
console.log("  - 按 T 随机改变所有水池透明度");

// 清理函数
function cleanup() {
    rectanglePool.dispose();
    circularPool.dispose();
    hexagonPool.dispose();
    console.log("🧹 所有资源已清理");
}

// 页面卸载时清理资源
window.addEventListener('beforeunload', cleanup); 