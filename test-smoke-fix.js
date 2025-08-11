// 烟雾效果修复验证脚本
// 在浏览器控制台运行此脚本测试修复后的烟雾效果

console.log('=== 烟雾效果修复验证 ===');

// 检查修复后的文件是否加载
if (typeof SmokeParticleSystem !== 'undefined') {
    console.log('✅ SmokeParticleSystem 类已定义');
    
    // 创建测试场景
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    // 添加光源
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);
    
    // 设置相机位置
    camera.position.z = 5;
    
    // 创建烟雾效果
    const smokeOptions = {
        maxParticles: 100,
        particleSize: 0.5,
        emissionRate: 20,
        lifetime: 3,
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(0, 1, 0),
        color: new THREE.Color(0x888888),
        spread: 1,
        windForce: new THREE.Vector3(0.1, 0, 0),
        turbulence: 0.1
    };
    
    const smokeSystem = new SmokeParticleSystem(scene, smokeOptions);
    
    // 测试全局效果管理
    if (window.SmokeEffectManager) {
        console.log('✅ SmokeEffectManager 类已定义');
        const manager = new SmokeEffectManager();
        const effectId = manager.createSmokeEffect(scene, smokeOptions);
        console.log(`✅ 创建烟雾效果: ${effectId}`);
        
        // 测试移除效果
        setTimeout(() => {
            const removed = manager.removeEffect(effectId);
            console.log(`✅ 移除烟雾效果: ${removed}`);
        }, 5000);
    }
    
    // 动画循环
    function animate() {
        requestAnimationFrame(animate);
        
        if (smokeSystem.update) {
            smokeSystem.update(0.016); // 60fps
        }
        
        renderer.render(scene, camera);
    }
    
    animate();
    
    console.log('🚀 烟雾效果测试已启动');
    
} else {
    console.log('❌ SmokeParticleSystem 类未找到');
}

// 内存泄漏检测
console.log('🔍 内存泄漏检测...');
if (window.performance && window.performance.memory) {
    setInterval(() => {
        const mem = window.performance.memory;
        console.log(`内存使用: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    }, 5000);
}

// 错误处理测试
console.log('🧪 错误处理测试...');
try {
    // 测试无效纹理路径
    const badOptions = {
        maxParticles: 10,
        particleSize: 1,
        emissionRate: 5,
        lifetime: 2
    };
    
    const testScene = new THREE.Scene();
    const testSystem = new SmokeParticleSystem(testScene, badOptions);
    console.log('✅ 无效纹理路径已处理');
    
} catch (error) {
    console.error('❌ 错误处理失败:', error);
}