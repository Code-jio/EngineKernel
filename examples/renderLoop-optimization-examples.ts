import { RenderLoop } from "../src/plugins/webgl/renderLoop";
import { THREE } from "../src/plugins/basePlugin";

/**
 * 优化后的渲染循环使用示例
 */

// 基础使用示例
export function basicRenderLoopExample() {
    console.log('📊 基础渲染循环示例');
    
    const renderLoop = new RenderLoop({});
    
    // 初始化渲染循环
    renderLoop.initialize();
    
    // 添加简单任务
    renderLoop.addTask('camera-update', () => {
        // 相机更新逻辑
        console.log('更新相机');
    });
    
    // 添加高优先级任务
    renderLoop.addTask('physics-update', () => {
        // 物理更新逻辑
        console.log('更新物理');
    }, -1); // 负数表示高优先级
    
    // 添加低优先级任务
    renderLoop.addTask('ui-update', () => {
        // UI更新逻辑
        console.log('更新UI');
    }, 10);
    
    return renderLoop;
}

// 性能监控示例
export function performanceMonitoringExample() {
    console.log('📈 性能监控示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 定期输出性能统计
    setInterval(() => {
        const metrics = renderLoop.getPerformanceMetrics();
        console.log('性能统计:', {
            fps: Math.round(metrics.fps),
            frameTime: Math.round(metrics.frameTime * 100) / 100,
            totalFrames: metrics.totalFrames
        });
    }, 1000);
    
    return renderLoop;
}

// 帧率控制示例
export function frameRateControlExample() {
    console.log('🎯 帧率控制示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 设置目标帧率为 30 FPS
    renderLoop.setTargetFPS(30);
    
    // 添加性能密集型任务
    renderLoop.addTask('heavy-computation', () => {
        // 模拟耗时计算
        const start = performance.now();
        while (performance.now() - start < 5) {
            // 消耗 5ms
        }
    });
    
    return renderLoop;
}

// 按需渲染示例
export function onDemandRenderingExample() {
    console.log('⚡ 按需渲染示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 启用按需渲染模式
    renderLoop.setOnDemandMode(true);
    
    // 添加任务
    renderLoop.addTask('static-scene', () => {
        // 静态场景渲染
        console.log('渲染静态场景');
    });
    
    // 模拟用户交互触发渲染
    setTimeout(() => {
        console.log('用户交互，请求渲染');
        renderLoop.requestRender();
    }, 2000);
    
    return renderLoop;
}

// 任务管理示例
export function taskManagementExample() {
    console.log('📋 任务管理示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 添加多个任务
    renderLoop.addTask('task1', () => console.log('任务1'), 1);
    renderLoop.addTask('task2', () => console.log('任务2'), 2);
    renderLoop.addTask('task3', () => console.log('任务3'), 3);
    
    console.log('初始任务数量:', renderLoop.getTaskCount());
    
    // 禁用某个任务
    setTimeout(() => {
        renderLoop.disableTask('task2');
        console.log('禁用task2后，启用任务数量:', renderLoop.getEnabledTaskCount());
    }, 1000);
    
    // 重新启用任务
    setTimeout(() => {
        renderLoop.enableTask('task2');
        console.log('重新启用task2后，启用任务数量:', renderLoop.getEnabledTaskCount());
    }, 2000);
    
    // 移除任务
    setTimeout(() => {
        renderLoop.removeTask('task3');
        console.log('移除task3后，总任务数量:', renderLoop.getTaskCount());
    }, 3000);
    
    return renderLoop;
}

// 错误处理示例
export function errorHandlingExample() {
    console.log('🛡️ 错误处理示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 添加会出错的任务
    renderLoop.addTask('error-task', () => {
        throw new Error('模拟任务错误');
    });
    
    // 添加正常任务
    renderLoop.addTask('normal-task', () => {
        console.log('正常任务执行');
    });
    
    return renderLoop;
}

// 完整的场景示例
export function completeSceneExample(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
    console.log('🎮 完整场景示例');
    
    const renderLoop = new RenderLoop({});
    
    // 创建旋转立方体
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    
    // 添加动画任务
    renderLoop.addTask('cube-rotation', () => {
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.01;
    }, 0);
    
    // 添加渲染任务
    renderLoop.addTask('scene-render', () => {
        renderer.render(scene, camera);
    }, 100); // 低优先级，最后执行
    
    // 添加相机控制任务
    renderLoop.addTask('camera-control', () => {
        // 相机绕Y轴旋转
        const time = Date.now() * 0.001;
        camera.position.x = Math.cos(time) * 10;
        camera.position.z = Math.sin(time) * 10;
        camera.lookAt(0, 0, 0);
    }, -1); // 高优先级，先执行
    
    // 初始化并启动
    renderLoop.initialize();
    
    return renderLoop;
}

// 性能优化示例
export function performanceOptimizationExample() {
    console.log('🚀 性能优化示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 设置合理的目标帧率
    renderLoop.setTargetFPS(60);
    
    // 添加性能监控任务
    renderLoop.addTask('performance-monitor', () => {
        const metrics = renderLoop.getPerformanceMetrics();
        
        // 如果帧率过低，自动启用按需渲染
        if (metrics.fps < 30) {
            console.log('帧率过低，启用按需渲染模式');
            renderLoop.setOnDemandMode(true);
        }
        
        // 如果帧率恢复，禁用按需渲染
        if (metrics.fps > 50 && renderLoop.getDebugInfo().onDemandMode) {
            console.log('帧率恢复，禁用按需渲染模式');
            renderLoop.setOnDemandMode(false);
        }
    }, -10); // 最高优先级
    
    return renderLoop;
}

// 调试和监控示例
export function debuggingExample() {
    console.log('🔍 调试和监控示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 添加几个任务
    renderLoop.addTask('debug-task1', () => {}, 1);
    renderLoop.addTask('debug-task2', () => {}, 2);
    renderLoop.addTask('debug-task3', () => {}, 3);
    
    // 定期输出调试信息
    setInterval(() => {
        const debugInfo = renderLoop.getDebugInfo();
        console.log('调试信息:', JSON.stringify(debugInfo, null, 2));
    }, 5000);
    
    return renderLoop;
}

// 生命周期管理示例
export function lifecycleManagementExample() {
    console.log('🔄 生命周期管理示例');
    
    const renderLoop = new RenderLoop({});
    renderLoop.initialize();
    
    // 添加任务
    renderLoop.addTask('lifecycle-task', () => {
        console.log('生命周期任务执行');
    });
    
    // 模拟生命周期
    setTimeout(() => {
        console.log('暂停渲染循环');
        renderLoop.pause();
    }, 2000);
    
    setTimeout(() => {
        console.log('恢复渲染循环');
        renderLoop.resume();
    }, 4000);
    
    setTimeout(() => {
        console.log('停止渲染循环');
        renderLoop.stop();
    }, 6000);
    
    return renderLoop;
}

// 使用说明和最佳实践
export function usageGuidelines() {
    console.log(`
📖 渲染循环优化使用指南：

1. 基础使用：
   - 使用 addTask(id, callback, priority) 添加任务
   - 优先级：负数=高优先级，正数=低优先级
   - 使用有意义的任务ID便于管理

2. 性能优化：
   - 使用 setTargetFPS() 控制帧率
   - 在静态场景中启用按需渲染模式
   - 定期监控性能指标

3. 任务管理：
   - 使用 enableTask/disableTask 动态控制任务
   - 及时移除不需要的任务
   - 合理设置任务优先级

4. 错误处理：
   - 任务中的错误会被自动捕获
   - 错误的任务会被暂时禁用
   - 监听 render-loop:error 事件

5. 调试技巧：
   - 使用 getDebugInfo() 获取详细状态
   - 使用 getPerformanceMetrics() 监控性能
   - 合理使用控制台输出

6. 生命周期：
   - 使用 pause/resume 控制渲染循环
   - 使用 stop() 完全停止并清理资源
   - 注意清理事件监听器
    `);
} 