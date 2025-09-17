// DataRainEffect 高级使用示例
import * as THREE from 'three';
import { DataRainEffect } from '../src/plugins/effects/DataRainEffect';

// 初始化场景、相机和渲染器
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 创建数据雨特效实例
const dataRainEffect = new DataRainEffect({ 
    scene: scene, 
    camera: camera, 
    renderer: renderer 
});

// 高级配置参数
const advancedParams = {
    particleCount: 1500,        // 增加粒子数量
    columnCount: 100,           // 增加列数
    speed: { min: 0.8, max: 3.5 }, // 扩大速度范围
    fontSize: 20,               // 增大字体
    charSet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()!+-=', // 扩展字符集
    color: '#00ff41',           // 经典黑客绿
    fadeOutStrength: 0.92,      // 调整淡出强度
    swayAmplitude: 1.0,         // 增加摆动幅度
    flickerChance: 0.08,        // 增加闪烁概率
    headCharBrightness: 2.0     // 增强首字符亮度
};

// 应用高级配置
dataRainEffect.updateParams(advancedParams);

// 动态密度控制示例
// 在低性能设备上降低密度
function adjustDensityForPerformance() {
    const density = window.innerWidth < 768 ? 0.6 : 1.0; // 移动端降低密度
    dataRainEffect.setDensity(density);
}

// 监听窗口大小变化
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // 调整密度以适应新窗口大小
    adjustDensityForPerformance();
});

// 添加交互控制
document.addEventListener('keydown', (event) => {
    switch(event.key) {
        case 'd': // 按D键增加密度
            dataRainEffect.setDensity(1.5);
            break;
        case 'a': // 按A键减少密度
            dataRainEffect.setDensity(0.5);
            break;
        case 'r': // 按R键重置密度
            dataRainEffect.setDensity(1.0);
            break;
    }
});

// 启动动画
dataRainEffect.startAnimation();

// 渲染循环
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();

// 性能监控示例
function monitorPerformance() {
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(stats.dom);
    
    function animateWithStats() {
        stats.begin();
        // 动画代码在这里
        stats.end();
        requestAnimationFrame(animateWithStats);
    }
    
    requestAnimationFrame(animateWithStats);
}

// 在需要时启动性能监控
// monitorPerformance();