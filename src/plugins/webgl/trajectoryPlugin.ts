import { THREE, BasePlugin } from "../basePlugin";
import eventBus from "../../eventBus/eventBus";

/**
 * 运动轨迹插件
 *
 * 功能：
 * 1. 固定步长记录点位
 * 2. 绑定到ModelMarker标注
 * 3. 高性能轨迹线渲染
 * 4. 简单的内存管理
 */

// 轨迹点接口
interface TrajectoryPoint {
    position: THREE.Vector3;
    timestamp: number;
}

// 轨迹配置接口
interface TrajectoryConfig {
    markerModelId: string; // 绑定的ModelMarker模型ID
    stepDistance: number; // 固定步长距离
    maxPoints: number; // 最大点数
    lineColor: THREE.Color;
    lineWidth: number;
    opacity: number;
    visible: boolean;
}

// 轨迹实例接口
interface TrajectoryInstance {
    id: string;
    config: TrajectoryConfig;
    points: TrajectoryPoint[];
    lastPosition: THREE.Vector3 | null;
    lineGeometry: THREE.BufferGeometry;
    lineMaterial: THREE.LineBasicMaterial;
    lineObject: THREE.Line;
    isActive: boolean;
}

export class SimpleTrajectoryPlugin extends BasePlugin {
    private scene: THREE.Scene | null = null;
    private modelMarkerPlugin: any = null;
    private trajectoryInstances: Map<string, TrajectoryInstance> = new Map();
    private updateTimer: number | null = null;
    private instanceIdCounter: number = 0;

    constructor(userData: any = {}) {
        super(userData);
    }

    /**
     * 插件初始化
     */
    async init(){
        if (!this.modelMarkerPlugin) {
            console.warn("⚠️ SimpleTrajectoryPlugin: 未找到ModelMarker插件");
        }
        // 启动更新循环
        this.startUpdateLoop();
    }

    async load(): Promise<void> {
        // 基类要求的方法
    }

    /**
     * 创建轨迹记录器
     */
    public createTrajectory(config: Partial<TrajectoryConfig>): string {
        const trajectoryId = this.generateTrajectoryId();

        // 合并默认配置
        const finalConfig: TrajectoryConfig = {
            markerModelId: config.markerModelId || "",
            stepDistance: config.stepDistance || 1.0, // 1米步长
            maxPoints: config.maxPoints || 1000,
            lineColor: config.lineColor || new THREE.Color(0x00ff00),
            lineWidth: config.lineWidth || 2,
            opacity: config.opacity || 0.8,
            visible: config.visible !== false,
        };

        // 验证ModelMarker是否存在
        if (this.modelMarkerPlugin && !this.modelMarkerPlugin.getModelInfo(finalConfig.markerModelId)) {
            console.warn(`⚠️ ModelMarker模型不存在: ${finalConfig.markerModelId}`);
        }

        // 创建轨迹实例
        const instance: TrajectoryInstance = {
            id: trajectoryId,
            config: finalConfig,
            points: [],
            lastPosition: null,
            lineGeometry: new THREE.BufferGeometry(),
            lineMaterial: new THREE.LineBasicMaterial({
                color: finalConfig.lineColor,
                opacity: finalConfig.opacity,
                transparent: finalConfig.opacity < 1.0,
                linewidth: finalConfig.lineWidth,
            }),
            lineObject: new THREE.Line(),
            isActive: false,
        };

        // 设置线条对象
        instance.lineObject.geometry = instance.lineGeometry;
        instance.lineObject.material = instance.lineMaterial;
        instance.lineObject.visible = finalConfig.visible;
        instance.lineObject.frustumCulled = true;

        // 添加到场景
        this.scene!.add(instance.lineObject);

        // 存储实例
        this.trajectoryInstances.set(trajectoryId, instance);

        console.log(`✅ 简化轨迹记录器已创建: ${trajectoryId}`);
        eventBus.emit("trajectory:created", { trajectoryId, config: finalConfig });

        return trajectoryId;
    }

    /**
     * 开始记录轨迹
     */
    public startRecording(trajectoryId: string): boolean {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return false;

        instance.isActive = true;
        instance.lastPosition = null; // 重置最后位置

        console.log(`🎬 开始记录轨迹: ${trajectoryId}`);
        eventBus.emit("trajectory:recordingStarted", { trajectoryId });
        return true;
    }

    /**
     * 停止记录轨迹
     */
    public stopRecording(trajectoryId: string): boolean {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return false;

        instance.isActive = false;

        console.log(`⏹️ 停止记录轨迹: ${trajectoryId}`);
        eventBus.emit("trajectory:recordingStopped", { trajectoryId });
        return true;
    }

    /**
     * 更新轨迹（在更新循环中调用）
     */
    private updateTrajectory(instance: TrajectoryInstance): void {
        if (!instance.isActive || !this.modelMarkerPlugin) return;

        // 获取ModelMarker的当前位置
        const modelInfo = this.modelMarkerPlugin.getModelInfo(instance.config.markerModelId);
        if (!modelInfo || !modelInfo.transform) return;

        const currentPosition = modelInfo.transform.position;

        // 检查是否需要记录新点（固定步长）
        if (
            !instance.lastPosition ||
            instance.lastPosition.distanceTo(currentPosition) >= instance.config.stepDistance
        ) {
            // 添加新点
            const point: TrajectoryPoint = {
                position: currentPosition.clone(),
                timestamp: Date.now(),
            };

            instance.points.push(point);
            instance.lastPosition = currentPosition.clone();

            // 检查最大点数限制
            if (instance.points.length > instance.config.maxPoints) {
                instance.points.shift(); // 移除最旧的点
            }

            // 更新轨迹线显示
            this.updateTrajectoryLine(instance);
        }
    }

    /**
     * 更新轨迹线几何体
     */
    private updateTrajectoryLine(instance: TrajectoryInstance): void {
        if (instance.points.length < 2) {
            // 隐藏线条
            instance.lineObject.visible = false;
            return;
        }

        // 创建顶点数据
        const positions = new Float32Array(instance.points.length * 3);

        for (let i = 0; i < instance.points.length; i++) {
            const point = instance.points[i];
            positions[i * 3] = point.position.x;
            positions[i * 3 + 1] = point.position.y;
            positions[i * 3 + 2] = point.position.z;
        }

        // 更新几何体
        instance.lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        instance.lineGeometry.computeBoundingSphere();

        // 显示线条
        instance.lineObject.visible = instance.config.visible;
    }

    /**
     * 清空轨迹
     */
    public clearTrajectory(trajectoryId: string): boolean {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return false;

        instance.points = [];
        instance.lastPosition = null;
        instance.lineObject.visible = false;

        console.log(`🧹 轨迹已清空: ${trajectoryId}`);
        eventBus.emit("trajectory:cleared", { trajectoryId });
        return true;
    }

    /**
     * 设置轨迹可见性
     */
    public setTrajectoryVisible(trajectoryId: string, visible: boolean): boolean {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return false;

        instance.config.visible = visible;
        instance.lineObject.visible = visible && instance.points.length >= 2;

        return true;
    }

    /**
     * 更新轨迹配置
     */
    public updateTrajectoryConfig(trajectoryId: string, newConfig: Partial<TrajectoryConfig>): boolean {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return false;

        // 更新配置
        Object.assign(instance.config, newConfig);

        // 应用材质变化
        if (newConfig.lineColor) {
            instance.lineMaterial.color = newConfig.lineColor;
        }
        if (newConfig.opacity !== undefined) {
            instance.lineMaterial.opacity = newConfig.opacity;
            instance.lineMaterial.transparent = newConfig.opacity < 1.0;
        }
        if (newConfig.visible !== undefined) {
            instance.lineObject.visible = newConfig.visible && instance.points.length >= 2;
        }

        // 如果步长改变，重置最后位置以触发立即记录
        if (newConfig.stepDistance) {
            instance.lastPosition = null;
        }

        console.log(`🔧 轨迹配置已更新: ${trajectoryId}`);
        eventBus.emit("trajectory:configUpdated", { trajectoryId, newConfig });
        return true;
    }

    /**
     * 获取轨迹信息
     */
    public getTrajectoryInfo(trajectoryId: string): any {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return null;

        return {
            id: instance.id,
            config: instance.config,
            pointCount: instance.points.length,
            isActive: instance.isActive,
            isVisible: instance.lineObject.visible,
            memoryUsage: instance.points.length * (3 * 4 + 8), // position + timestamp
            boundingBox: this.calculateBoundingBox(instance.points),
        };
    }

    /**
     * 获取所有轨迹信息
     */
    public getAllTrajectoriesInfo(): { [key: string]: any } {
        const result: { [key: string]: any } = {};

        this.trajectoryInstances.forEach((instance, id) => {
            result[id] = this.getTrajectoryInfo(id);
        });

        return result;
    }

    /**
     * 计算边界框
     */
    private calculateBoundingBox(points: TrajectoryPoint[]): THREE.Box3 {
        const box = new THREE.Box3();

        points.forEach(point => {
            box.expandByPoint(point.position);
        });

        return box;
    }

    /**
     * 导出轨迹数据
     */
    public exportTrajectoryData(trajectoryId: string): any {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return null;

        return {
            id: trajectoryId,
            config: instance.config,
            points: instance.points.map(point => ({
                position: { x: point.position.x, y: point.position.y, z: point.position.z },
                timestamp: point.timestamp,
            })),
            exportTime: Date.now(),
        };
    }

    /**
     * 导入轨迹数据
     */
    public importTrajectoryData(data: any): string | null {
        if (!data || !data.config || !data.points) return null;

        const trajectoryId = this.createTrajectory(data.config);
        const instance = this.trajectoryInstances.get(trajectoryId);

        if (instance) {
            // 导入点位数据
            instance.points = data.points.map((pointData: any) => ({
                position: new THREE.Vector3(pointData.position.x, pointData.position.y, pointData.position.z),
                timestamp: pointData.timestamp,
            }));

            // 更新显示
            this.updateTrajectoryLine(instance);

            console.log(`📥 轨迹数据已导入: ${trajectoryId} (${instance.points.length}点)`);
        }

        return trajectoryId;
    }

    /**
     * 启动更新循环
     */
    private startUpdateLoop(): void {
        
        eventBus.on("update", () => {
            // 更新所有活跃的轨迹
            this.trajectoryInstances.forEach(instance => {
                if (instance.isActive) {
                    this.updateTrajectory(instance);
                }
            });
        })
    }

    /**
     * 移除轨迹
     */
    public removeTrajectory(trajectoryId: string): boolean {
        const instance = this.trajectoryInstances.get(trajectoryId);
        if (!instance) return false;

        // 从场景移除
        this.scene?.remove(instance.lineObject);

        // 清理资源
        instance.lineGeometry.dispose();
        instance.lineMaterial.dispose();

        // 移除实例
        this.trajectoryInstances.delete(trajectoryId);

        console.log(`🗑️ 轨迹已移除: ${trajectoryId}`);
        eventBus.emit("trajectory:removed", { trajectoryId });
        return true;
    }

    /**
     * 生成轨迹ID
     */
    private generateTrajectoryId(): string {
        return `trajectory_${++this.instanceIdCounter}_${Date.now()}`;
    }

    /**
     * 获取性能统计
     */
    public getPerformanceStats(): {
        totalTrajectories: number;
        activeTrajectories: number;
        totalPoints: number;
        totalMemoryMB: number;
    } {
        let totalPoints = 0;
        let activeCount = 0;
        let totalMemory = 0;

        this.trajectoryInstances.forEach(instance => {
            totalPoints += instance.points.length;
            totalMemory += instance.points.length * (3 * 4 + 8); // position + timestamp
            if (instance.isActive) activeCount++;
        });

        return {
            totalTrajectories: this.trajectoryInstances.size,
            activeTrajectories: activeCount,
            totalPoints,
            totalMemoryMB: totalMemory / (1024 * 1024),
        };
    }

    /**
     * 销毁插件
     */
    dispose(): void {
        // 停止更新循环
        if (this.updateTimer) {
            cancelAnimationFrame(this.updateTimer);
        }

        // 清理所有轨迹
        this.trajectoryInstances.forEach((instance, id) => {
            this.removeTrajectory(id);
        });

        console.log("🧹 SimpleTrajectoryPlugin已销毁");
    }
}
