import { FireMarker } from "../src/plugins/webgl/fireMarker";
import THREE from "../src/utils/three-imports";

/**
 * FireMarker 使用示例
 * 展示如何使用PlaneGeometry + Billboard技术实现的3D火焰对象
 */

// 基础使用示例
export function basicFireMarkerExample(scene: THREE.Scene, camera: THREE.Camera) {
    console.log('🔥 基础火焰标记示例');
    
    // 创建基础火焰对象
    const basicFire = new FireMarker({
        position: [0, 1, 0],     // 位置稍高一些
        size: 2.0,               // 2倍大小
        intensity: 0.8,          // 80%强度
        animationSpeed: 1.2      // 1.2倍速度
    });
    
    // 添加到场景
    basicFire.addToScene(scene, camera);
    
    // 返回火焰对象供后续操控
    return basicFire;
}

// 多个火焰示例
export function multipleFireMarkersExample(scene: THREE.Scene, camera: THREE.Camera) {
    console.log('🔥 多个火焰标记示例');
    
    const fires: FireMarker[] = [];
    
    // 创建一圈火焰
    const radius = 5;
    const count = 6;
    
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        const fire = new FireMarker({
            position: [x, 0.5, z],
            size: 1.5,
            intensity: 0.6 + Math.random() * 0.4,  // 随机强度
            baseColor: i % 2 === 0 ? 0xff4400 : 0xff6600,  // 交替颜色
            animationSpeed: 0.8 + Math.random() * 0.6,     // 随机速度
            flickerIntensity: 0.05 + Math.random() * 0.1   // 随机闪烁
        });
        
        fire.addToScene(scene, camera);
        fires.push(fire);
    }
    
    return fires;
}

// 自定义颜色火焰示例
export function customColorFireExample(scene: THREE.Scene, camera: THREE.Camera) {
    console.log('🔥 自定义颜色火焰示例');
    
    // 蓝色火焰
    const blueFire = new FireMarker({
        position: [-3, 1, 0],
        size: 1.8,
        baseColor: 0x0044ff,    // 蓝色底部
        tipColor: 0x88ccff,     // 淡蓝色顶部
        intensity: 0.9,
        waveAmplitude: 0.15
    });
    
    // 绿色火焰
    const greenFire = new FireMarker({
        position: [3, 1, 0],
        size: 1.8,
        baseColor: 0x00ff44,    // 绿色底部
        tipColor: 0xccff88,     // 淡绿色顶部
        intensity: 0.9,
        waveAmplitude: 0.15
    });
    
    // 紫色火焰
    const purpleFire = new FireMarker({
        position: [0, 1, -3],
        size: 1.8,
        baseColor: 0xff00ff,    // 紫色底部
        tipColor: 0xffccff,     // 淡紫色顶部
        intensity: 0.9,
        waveAmplitude: 0.15
    });
    
    blueFire.addToScene(scene, camera);
    greenFire.addToScene(scene, camera);
    purpleFire.addToScene(scene, camera);
    
    return { blueFire, greenFire, purpleFire };
}

// 动态控制示例
export function dynamicFireControlExample(scene: THREE.Scene, camera: THREE.Camera) {
    console.log('🔥 动态控制火焰示例');
    
    const fire = new FireMarker({
        position: [0, 0.5, 0],
        size: 2.5,
        intensity: 0.5,
        onUpdate: (deltaTime: number) => {
            // 可以在这里添加自定义更新逻辑
        },
        onVisibilityChange: (visible: boolean) => {
            console.log(`火焰可见性变化: ${visible}`);
        }
    });
    
    fire.addToScene(scene, camera);
    
    // 演示动态控制
    let time = 0;
    const controlLoop = () => {
        time += 0.016; // ~60fps
        
        // 动态调整强度（呼吸效果）
        const intensity = 0.5 + 0.3 * Math.sin(time * 2);
        fire.setIntensity(intensity);
        
        // 动态调整大小
        const size = 2.0 + 0.5 * Math.sin(time * 1.5);
        fire.setSize(size);
        
        // 动态移动位置
        const x = Math.sin(time * 0.5) * 2;
        const z = Math.cos(time * 0.5) * 2;
        fire.setPosition([x, 0.5 + Math.sin(time * 3) * 0.2, z]);
        
        requestAnimationFrame(controlLoop);
    };
    
    controlLoop();
    
    return fire;
}

// 渲染循环集成示例
export function renderLoopIntegrationExample(
    scene: THREE.Scene, 
    camera: THREE.Camera, 
    renderer: THREE.WebGLRenderer
) {
    console.log('🔥 渲染循环集成示例');
    
    // 创建几个火焰对象
    const fires = [
        new FireMarker({ position: [-2, 1, 0], size: 1.5 }),
        new FireMarker({ position: [2, 1, 0], size: 1.5 }),
        new FireMarker({ position: [0, 1, 2], size: 1.5 })
    ];
    
    // 添加到场景
    fires.forEach(fire => fire.addToScene(scene, camera));
    
    // 渲染循环
    function animate() {
        requestAnimationFrame(animate);
        
        // 更新所有火焰动画
        fires.forEach(fire => fire.update());
        
        // 渲染场景
        renderer.render(scene, camera);
    }
    
    animate();
    
    return fires;
}

// 性能优化示例
export function performanceOptimizedExample(scene: THREE.Scene, camera: THREE.Camera) {
    console.log('🔥 性能优化火焰示例');
    
    const fires: FireMarker[] = [];
    
    // 创建大量火焰但使用性能优化设置
    for (let i = 0; i < 20; i++) {
        const fire = new FireMarker({
            position: [
                (Math.random() - 0.5) * 20,
                0.5,
                (Math.random() - 0.5) * 20
            ],
            size: 1.0 + Math.random() * 0.5,
            intensity: 0.7,
            animationSpeed: 0.5 + Math.random() * 0.5,
            // 性能优化设置
            renderOrder: 1001,          // 后渲染
            depthWrite: false,          // 不写深度
            flickerIntensity: 0.05,     // 降低闪烁强度
            waveAmplitude: 0.08         // 降低波动幅度
        });
        
        fire.addToScene(scene, camera);
        fires.push(fire);
    }
    
    // 视锥剔除优化
    const frustum = new THREE.Frustum();
    const cameraMatrix = new THREE.Matrix4();
    
    const optimizedUpdate = () => {
        // 更新视锥体
        cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(cameraMatrix);
        
        // 只更新视锥体内的火焰
        fires.forEach(fire => {
            const position = fire.getPosition();
            if (frustum.containsPoint(position)) {
                fire.update();
                fire.setVisible(true);
            } else {
                fire.setVisible(false);  // 视锥外隐藏
            }
        });
        
        requestAnimationFrame(optimizedUpdate);
    };
    
    optimizedUpdate();
    
    return fires;
}

// 交互示例
export function interactiveFireExample(
    scene: THREE.Scene, 
    camera: THREE.Camera,
    domElement: HTMLElement
) {
    console.log('🔥 交互式火焰示例');
    
    const fire = new FireMarker({
        position: [0, 1, 0],
        size: 2.0
    });
    
    fire.addToScene(scene, camera);
    
    // 鼠标交互
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const onMouseMove = (event: MouseEvent) => {
        // 计算鼠标位置
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // 射线检测
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(fire.getMesh());
        
        if (intersects.length > 0) {
            // 鼠标悬停时增强火焰
            fire.setIntensity(1.0);
            fire.setSize(2.5);
        } else {
            // 恢复正常
            fire.setIntensity(0.7);
            fire.setSize(2.0);
        }
    };
    
    const onClick = (event: MouseEvent) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(fire.getMesh());
        
        if (intersects.length > 0) {
            // 点击时切换Billboard模式
            const currentBillboard = fire.getConfig().billboard;
            fire.setBillboard(!currentBillboard);
            console.log(`Billboard模式: ${!currentBillboard}`);
        }
    };
    
    domElement.addEventListener('mousemove', onMouseMove);
    domElement.addEventListener('click', onClick);
    
    // 清理函数
    const cleanup = () => {
        domElement.removeEventListener('mousemove', onMouseMove);
        domElement.removeEventListener('click', onClick);
        fire.dispose();
    };
    
    return { fire, cleanup };
}

// 完整的使用示例
export function completeFireMarkerDemo(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    domElement: HTMLElement
) {
    console.log('🔥 完整的FireMarker演示');
    
    // 创建多种类型的火焰
    const basicFire = basicFireMarkerExample(scene, camera);
    const multipleFires = multipleFireMarkersExample(scene, camera);
    const colorFires = customColorFireExample(scene, camera);
    const dynamicFire = dynamicFireControlExample(scene, camera);
    const interactiveFire = interactiveFireExample(scene, camera, domElement);
    
    // 统一的更新循环
    function animate() {
        requestAnimationFrame(animate);
        
        // 更新所有火焰
        basicFire.update();
        multipleFires.forEach(fire => fire.update());
        Object.values(colorFires).forEach(fire => fire.update());
        dynamicFire.update();
        interactiveFire.fire.update();
        
        // 渲染场景
        renderer.render(scene, camera);
    }
    
    animate();
    
    // 清理函数
    const cleanup = () => {
        basicFire.dispose();
        multipleFires.forEach(fire => fire.dispose());
        Object.values(colorFires).forEach(fire => fire.dispose());
        dynamicFire.dispose();
        interactiveFire.cleanup();
    };
    
    return { cleanup };
} 