/**
 * WaterMarker 使用示例
 * 展示如何创建和使用指定轮廓的水体渲染
 */

import { THREE } from "../src/plugins/basePlugin";
import { WaterMarker } from "../src/plugins/webgl/waterMarker";

// 示例1: 创建一个矩形池塘
export function createRectanglePond(): WaterMarker {
    // 定义矩形轮廓
    const rectangleContour = [
        new THREE.Vector3(-5, 0, -3),
        new THREE.Vector3(5, 0, -3),
        new THREE.Vector3(5, 0, 3),
        new THREE.Vector3(-5, 0, 3)
    ];

    const rectanglePond = new WaterMarker({
        height: 2,
        contour: rectangleContour,
        position: new THREE.Vector3(0, 0, 0),
        waterColor: 0x0088cc,
        transparency: 0.8,
        reflectivity: 0.9,
        waveScale: 2.0,
        distortionScale: 4.0,
        enableAnimation: true
    });

    console.log('✅ 矩形池塘创建完成');
    return rectanglePond;
}

// 示例2: 创建一个圆形湖泊
export function createCircularLake(): WaterMarker {
    // 定义圆形轮廓（使用多边形近似）
    const circularContour: THREE.Vector3[] = [];
    const radius = 8;
    const segments = 16;
    
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        circularContour.push(new THREE.Vector3(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
        ));
    }

    const circularLake = new WaterMarker({
        height: 3,
        contour: circularContour,
        position: new THREE.Vector3(20, 0, 0),
        waterColor: 0x1166aa,
        transparency: 0.7,
        reflectivity: 0.8,
        flowSpeed: 0.3,
        waveScale: 1.5,
        enableAnimation: true
    });

    console.log('✅ 圆形湖泊创建完成');
    return circularLake;
}

// 示例3: 创建一个复杂形状的河流
export function createRiverSection(): WaterMarker {
    // 定义弯曲河流轮廓
    const riverContour = [
        new THREE.Vector3(-15, 0, -2),
        new THREE.Vector3(-10, 0, -3),
        new THREE.Vector3(-5, 0, -2),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(5, 0, 1),
        new THREE.Vector3(10, 0, 3),
        new THREE.Vector3(15, 0, 2),
        new THREE.Vector3(15, 0, 5),
        new THREE.Vector3(10, 0, 6),
        new THREE.Vector3(5, 0, 4),
        new THREE.Vector3(0, 0, 2),
        new THREE.Vector3(-5, 0, 1),
        new THREE.Vector3(-10, 0, 0),
        new THREE.Vector3(-15, 0, 1)
    ];

    const riverSection = new WaterMarker({
        height: 1.5,
        contour: riverContour,
        position: new THREE.Vector3(-20, 0, 0),
        waterColor: 0x4a7c8a,
        transparency: 0.6,
        reflectivity: 0.7,
        flowSpeed: 0.8,
        waveScale: 3.0,
        distortionScale: 5.0,
        enableAnimation: true
    });

    console.log('✅ 河流段创建完成');
    return riverSection;
}

// 示例4: 创建建筑物周围的装饰水池
export function createDecorativePool(): WaterMarker {
    // 定义L形装饰水池轮廓
    const decorativeContour = [
        new THREE.Vector3(-4, 0, -4),
        new THREE.Vector3(4, 0, -4),
        new THREE.Vector3(4, 0, -1),
        new THREE.Vector3(1, 0, -1),
        new THREE.Vector3(1, 0, 4),
        new THREE.Vector3(-4, 0, 4)
    ];

    const decorativePool = new WaterMarker({
        height: 0.8,
        contour: decorativeContour,
        position: new THREE.Vector3(30, 0, 0),
        waterColor: 0x0099dd,
        transparency: 0.9,
        reflectivity: 1.0,
        flowSpeed: 0.2,
        waveScale: 0.8,
        distortionScale: 2.0,
        enableAnimation: true
    });

    console.log('✅ 装饰水池创建完成');
    return decorativePool;
}

// 示例5: 动态水体管理示例
export class WaterBodyManager {
    private waterBodies: WaterMarker[] = [];
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * 添加所有示例水体到场景
     */
    public createAllExamples(): void {
        console.log('🌊 开始创建所有水体示例...');

        // 创建各种水体
        const pond = createRectanglePond();
        const lake = createCircularLake();
        const river = createRiverSection();
        const pool = createDecorativePool();

        // 添加到管理器
        this.addWaterBody(pond);
        this.addWaterBody(lake);
        this.addWaterBody(river);
        this.addWaterBody(pool);

        console.log(`✅ 所有水体创建完成，共 ${this.waterBodies.length} 个水体`);
    }

    /**
     * 添加水体到场景和管理器
     */
    public addWaterBody(waterBody: WaterMarker): void {
        waterBody.addToScene(this.scene);
        this.waterBodies.push(waterBody);
        console.log(`💧 水体已添加，当前总数: ${this.waterBodies.length}`);
    }

    /**
     * 移除指定水体
     */
    public removeWaterBody(index: number): void {
        if (index >= 0 && index < this.waterBodies.length) {
            const waterBody = this.waterBodies[index];
            waterBody.removeFromScene();
            waterBody.dispose();
            this.waterBodies.splice(index, 1);
            console.log(`🗑️ 水体已移除，剩余: ${this.waterBodies.length} 个`);
        }
    }

    /**
     * 更新所有水体动画
     */
    public update(deltaTime: number): void {
        this.waterBodies.forEach(waterBody => {
            waterBody.update(deltaTime);
        });
    }

    /**
     * 设置所有水体的动画状态
     */
    public setAllAnimationEnabled(enabled: boolean): void {
        this.waterBodies.forEach(waterBody => {
            waterBody.setAnimationEnabled(enabled);
        });
        console.log(`🎬 所有水体动画已${enabled ? '启用' : '禁用'}`);
    }

    /**
     * 改变所有水体颜色
     */
    public changeAllWaterColor(color: number): void {
        this.waterBodies.forEach(waterBody => {
            waterBody.setWaterColor(color);
        });
        console.log(`🎨 所有水体颜色已更改为: #${color.toString(16)}`);
    }

    /**
     * 调整所有水体透明度
     */
    public setAllTransparency(transparency: number): void {
        this.waterBodies.forEach(waterBody => {
            waterBody.setTransparency(transparency);
        });
        console.log(`💎 所有水体透明度已设置为: ${transparency}`);
    }

    /**
     * 获取水体统计信息
     */
    public getStatistics(): any {
        return {
            count: this.waterBodies.length,
            waterBodies: this.waterBodies.map((wb, index) => ({
                index,
                options: wb.getOptions(),
                position: wb.getPosition()
            }))
        };
    }

    /**
     * 销毁所有水体
     */
    public dispose(): void {
        this.waterBodies.forEach(waterBody => {
            waterBody.removeFromScene();
            waterBody.dispose();
        });
        this.waterBodies = [];
        console.log('🗑️ 所有水体已销毁');
    }
}

// 示例6: 在BaseScene中使用WaterMarker
export function exampleUsageInBaseScene(scene: any): WaterBodyManager {
    console.log('🚀 BaseScene 中的 WaterMarker 使用示例');

    // 创建水体管理器
    const waterManager = new WaterBodyManager(scene.sceneInstance);

    // 创建所有示例水体
    waterManager.createAllExamples();

    // 设置定时器来演示动态效果
    let colorIndex = 0;
    const colors = [0x0088cc, 0x4a7c8a, 0x1166aa, 0x0099dd, 0x3388bb];
    
    setInterval(() => {
        waterManager.changeAllWaterColor(colors[colorIndex % colors.length]);
        colorIndex++;
    }, 5000);

    // 在场景更新循环中更新水体动画
    const originalUpdate = scene.update;
    scene.update = function() {
        originalUpdate.call(this);
        waterManager.update(performance.now());
    };

    // 返回管理器供外部使用
    return waterManager;
}

// 导出使用示例函数
export default {
    createRectanglePond,
    createCircularLake,
    createRiverSection,
    createDecorativePool,
    WaterBodyManager,
    exampleUsageInBaseScene
}; 