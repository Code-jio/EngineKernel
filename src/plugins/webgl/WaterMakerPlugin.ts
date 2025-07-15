import { THREE, BasePlugin } from "../basePlugin"
import { WaterMarker } from "./waterMarker";

export class WaterMarkerPlugin extends BasePlugin{
    private scenePlugin: any
    private waterMarker: WaterMarker | null = null
    
    constructor(meta: any){
        super(meta)
        this.scenePlugin = meta.userData.scenePlugin
    }

    public createWaterMarker(options: any){
        this.waterMarker = new WaterMarker(options)
        let waterMaterial = this.scenePlugin.floorManager.floor.material

        // 安全地访问和设置材质
        const mesh = this.waterMarker.getGroup().children[0] as THREE.Mesh
        if (mesh && Array.isArray(mesh.material)) {
            mesh.material[0] = waterMaterial
        }

        // 加入场景
        this.scenePlugin.scene.add(this.waterMarker.getGroup())
        return this.waterMarker
    }

    /**
     * 从房间轮廓创建水体标注（便捷方法）
     * @param roomCode 房间代码
     * @param buildingControlPlugin 建筑控制插件实例
     * @param options 可选的水体配置
     * @returns 创建的水体标注实例，如果失败返回null
     */
    public createWaterMarkerFromRoom(
        roomCode: string, 
        buildingControlPlugin: any, 
        options: {
            height?: number;
            waterColor?: number;
            transparency?: number;
            reflectivity?: number;
            flowSpeed?: number;
            waveScale?: number;
            distortionScale?: number;
            enableAnimation?: boolean;
        } = {}
    ): WaterMarker | null {
        try {
            // 获取房间的水体轮廓
            const waterBounding = buildingControlPlugin.getRoomWaterBounding(roomCode);
            
            if (!waterBounding) {
                console.warn(`⚠️ 房间 ${roomCode} 没有可用的水体轮廓信息`);
                return null;
            }

            // 转换轮廓格式
            const contour = waterBounding.vertices.map((vertex: any) => 
                new THREE.Vector3(vertex.x, vertex.y, vertex.z)
            );

            if (contour.length < 3) {
                console.warn(`⚠️ 房间 ${roomCode} 的轮廓点数量不足 (${contour.length} < 3)`);
                return null;
            }

            // 合并配置，提供合理的默认值
            const waterConfig = {
                height: options.height || 0.5, // 默认0.5米高度
                contour: contour,
                waterColor: options.waterColor || 0x4a90e2, // 默认蓝色
                transparency: options.transparency || 0.7,
                reflectivity: options.reflectivity || 0.8,
                flowSpeed: options.flowSpeed || 0.5,
                waveScale: options.waveScale || 1.0,
                distortionScale: options.distortionScale || 3.7,
                enableAnimation: options.enableAnimation !== false, // 默认启用动画
            };

            // 创建水体标注
            const waterMarker = new WaterMarker(waterConfig);
            
            // 添加到场景
            this.scenePlugin.scene.add(waterMarker.getGroup());

            console.log(`✅ 房间 ${roomCode} 的水体标注创建成功`);
            console.log(`   - 轮廓点数: ${waterBounding.vertexCount}`);
            console.log(`   - 中心点: (${waterBounding.center.x.toFixed(2)}, ${waterBounding.center.y.toFixed(2)}, ${waterBounding.center.z.toFixed(2)})`);
            console.log(`   - 水体高度: ${waterConfig.height}米`);

            return waterMarker;

        } catch (error) {
            console.error(`❌ 为房间 ${roomCode} 创建水体标注时发生错误:`, error);
            return null;
        }
    }

    /**
     * 批量为所有房间创建水体标注
     * @param buildingControlPlugin 建筑控制插件实例
     * @param options 可选的水体配置
     * @returns 创建成功的水体标注数量
     */
    public createWaterMarkersForAllRooms(
        buildingControlPlugin: any,
        options: {
            height?: number;
            waterColor?: number;
            transparency?: number;
            reflectivity?: number;
            flowSpeed?: number;
            waveScale?: number;
            distortionScale?: number;
            enableAnimation?: boolean;
            roomFilter?: (roomCode: string) => boolean; // 房间过滤函数
        } = {}
    ): number {
        try {
            const allWaterBoundings = buildingControlPlugin.getAllRoomWaterBoundings();
            let successCount = 0;

            allWaterBoundings.forEach((waterBounding: any, roomCode: string) => {
                // 如果提供了过滤函数，检查是否应该为该房间创建水体
                if (options.roomFilter && !options.roomFilter(roomCode)) {
                    console.log(`⏭️ 跳过房间 ${roomCode}（被过滤器排除）`);
                    return;
                }

                const waterMarker = this.createWaterMarkerFromRoom(roomCode, buildingControlPlugin, options);
                if (waterMarker) {
                    successCount++;
                }
            });

            console.log(`🌊 批量创建完成: ${successCount}/${allWaterBoundings.size} 个房间水体标注创建成功`);
            return successCount;

        } catch (error) {
            console.error(`❌ 批量创建水体标注时发生错误:`, error);
            return 0;
        }
    }
}