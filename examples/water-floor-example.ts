// 水面地板使用示例
import { FloorManager, FloorConfig } from '../src/plugins/webgl/floorManager';
import { THREE } from '../src/plugins/basePlugin';

/**
 * 水面地板示例
 * 演示如何创建和配置水面地板
 */
export class WaterFloorExample {
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private floorManager: FloorManager;
    
    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.floorManager = new FloorManager(scene);
    }
    
    /**
     * 创建基础水面地板
     */
    public createBasicWaterFloor(): void {
        const config: FloorConfig = {
            enabled: true,
            type: 'water',
            size: 1000,
            position: [0, 0, 0],
            waterConfig: {
                textureWidth: 512,
                textureHeight: 512,
                alpha: 0.85,           // 调整为半透明效果
                time: 0,
                waterColor: 0x001e0f,  // 深绿色水面
                distortionScale: 3.7,
                waterNormalsUrl: 'textures/waternormals.jpg',
                animationSpeed: 1.0,
                waveScale: 1.0
            }
        };
        
        this.floorManager.createFloor(config, this.renderer);
        console.log('✅ 基础水面地板已创建');
    }
    
    /**
     * 创建自定义水面地板
     */
    public createCustomWaterFloor(): void {
        const config: FloorConfig = {
            enabled: true,
            type: 'water',
            size: 2000,
            position: [0, -1, 0],
            waterConfig: {
                textureWidth: 1024,     // 更高分辨率
                textureHeight: 1024,
                alpha: 0.8,             // 半透明
                time: 0,
                waterColor: 0x006994,   // 蓝色水面
                distortionScale: 2.0,   // 较小的扭曲
                waterNormalsUrl: 'public/textures/waternormals.jpg',
                animationSpeed: 1.5,    // 更快的动画
                waveScale: 1.2
            }
        };
        
        this.floorManager.createFloor(config, this.renderer);
        console.log('✅ 自定义水面地板已创建');
    }
    
    /**
     * 更新水面动画
     */
    public update(deltaTime: number, camera: THREE.Camera): void {
        this.floorManager.updateFloor(deltaTime, camera);
    }
    
    /**
     * 切换到其他地板类型
     */
    public switchToStaticFloor(): void {
        const config: FloorConfig = {
            enabled: true,
            type: 'static',
            size: 1000,
            position: [0, 0, 0],
            staticConfig: {
                texture: 'public/textures/floor.png',
                color: 0x808080,
                opacity: 1.0,
                roughness: 0.8,
                metalness: 0.2,
                tiling: [4, 4]
            }
        };
        
        this.floorManager.switchFloorType('static', config, this.renderer);
        console.log('✅ 已切换到静态地板');
    }
    
    /**
     * 获取地板信息
     */
    public getFloorInfo(): any {
        return this.floorManager.getFloorInfo();
    }
    
    /**
     * 销毁地板管理器
     */
    public destroy(): void {
        this.floorManager.destroy();
    }
}

// 使用示例
/*
// 在你的场景初始化代码中：
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();
const waterExample = new WaterFloorExample(scene, renderer);

// 创建水面地板
waterExample.createBasicWaterFloor();

// 在渲染循环中更新
function animate() {
    const deltaTime = clock.getDelta();
    waterExample.update(deltaTime, camera);
    
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
*/ 