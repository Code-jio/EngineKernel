// 这个插件的功能主要有：
// 1. 拆分可互动楼层，并提供拆分动画（主要表现为：各个楼层在垂直方向上一层一层的展开）
// 2. 恢复楼层原有状态（将已拆分的楼层恢复到原有状态），并恢复建筑外立面的显示
// 3. 切换至指定楼层，并提供切换动画，切换完成时，其他楼层设置为半透明
// 

import { THREE, BasePlugin } from "../basePlugin"
import * as TWEEN from '@tweenjs/tween.js'
import eventBus from "../../eventBus/eventBus"

/**
 * 楼层状态枚举
 */
export enum FloorState {
    NORMAL = 'NORMAL',      // 正常显示状态
    EXPANDED = 'EXPANDED',  // 展开状态
    FOCUSED = 'FOCUSED'     // 聚焦状态（单层显示）
}

/**
 * 楼层项接口
 */
export interface FloorItem {
    group: THREE.Group | THREE.Object3D | THREE.Scene // 楼层组对象
    floorNumber: number         // 楼层号
    originalPosition: THREE.Vector3  // 原始位置
    targetPosition: THREE.Vector3    // 目标位置
    isVisible: boolean          // 是否可见
    opacity: number             // 透明度
    nodeCount: number           // 节点数量
    associatedEquipment: {
        equipment: THREE.Object3D
        equipmentName: string
        roomCode: string
        floorNumber: number
    }[]  // 关联的设备模型数组
    rooms: RoomItem[] // 关联的房间列表
}

export interface RoomItem {
    group: THREE.Group | THREE.Object3D | THREE.Scene        // 房间组对象
    roomNumber: string          // 房间号
    floorNumber:number
    originalPosition: THREE.Vector3  // 原始位置
    targetPosition: THREE.Vector3    // 目标位置
    isVisible: boolean          // 是否可见
    opacity: number             // 透明度
    associatedEquipment: {
        equipment: THREE.Object3D
        equipmentName: string
        roomCode: string
        floorNumber: number
    }[]  // 关联的设备模型数组
}

/**
 * 楼层控制配置接口
 */
export interface FloorControlConfig {
    expandDistance: number        // 展开间距（每层之间的距离）
    animationDuration: number     // 动画持续时间（毫秒）
    focusOpacity: number         // 聚焦楼层透明度
    unfocusOpacity: number       // 非聚焦楼层透明度
    focusFloorStructureOpacity: boolean  // 聚焦楼层主体结构是否应用透明度（false=完全不透明）
    easingFunction: string       // 缓动函数
    showFacade: boolean          // 是否显示外立面
    autoHideFacade: boolean      // 展开时是否自动隐藏外立面
    enableCameraAnimation: boolean    // 是否启用相机动画
    cameraAnimationDuration: number   // 相机动画持续时间
    cameraDistanceMultiplier: number  // 相机距离倍数（基于楼层大小）
    cameraMinHeight: number          // 相机最小观察距离
    restoreCameraOnUnfocus: boolean   // 取消聚焦时是否恢复相机位置
}

/**
 * 楼层控制事件类型
 */
export interface FloorControlEvents {
    onExpandStart?: () => void
    onExpandComplete?: () => void
    onCollapseStart?: () => void
    onCollapseComplete?: () => void
    onFloorFocus?: (floorNumber: number) => void
    onFloorUnfocus?: () => void
    onCameraAnimationStart?: (floorNumber: number) => void
    onCameraAnimationComplete?: (floorNumber: number) => void
    onCameraRestore?: () => void
}

// 添加userData结构定义
interface BuildingObjectUserData {
    // 原有的模型名称信息
    modelName?: string
    isBuildingModel?: boolean
    
    // 新增的解析信息
    buildingInfo?: {
        type: 'floor' | 'room' | 'facade' | 'equipment' | 'unknown'
        buildingName?: string
        floorNumber?: number
        roomCode?: string
        isFacade?: boolean
    }
}

/**
 * 楼层控制插件
 * 
 * 功能：
 * 1. 拆分可互动楼层，并提供拆分动画（主要表现为：各个楼层在垂直方向上一层一层的展开）
 * 2. 恢复楼层原有状态（将已拆分的楼层恢复到原有状态），并恢复建筑外立面的显示
 * 3. 切换至指定楼层，并提供切换动画，切换完成时，其他楼层设置为半透明
 */
export class BuildingControlPlugin extends BasePlugin {
    public name = "BuildingControlPlugin"
    public version = "1.0.0"

    private currentState: FloorState = FloorState.NORMAL
    private floors: Map<number, FloorItem> = new Map()
    private facadeGroup: THREE.Group | null = null
    private currentBuildingModel: THREE.Group | null = null
    private activeTweens: TWEEN.Group = new TWEEN.Group()
    private focusedFloor: number | null = null
    private scene: THREE.Scene | null = null
    public scenePlugin: any
    public allDevices: THREE.Object3D[] = []

    // 外立面状态管理（参考mousePickPlugin的实现）
    private hiddenFacades: THREE.Object3D[] = []
    
    // 建筑结构管理属性
    private facades: THREE.Object3D[] = []          // 外立面对象数组
    private rooms: Map<string, RoomItem> = new Map() // 房间索引 roomCode -> Roomitem 
    private parseResult: ReturnType<typeof this.parseBuildingModel> | null = null

    // 默认配置
    private config: FloorControlConfig = {
        expandDistance: 15,
        animationDuration: 1000,
        focusOpacity: 1.0,
        unfocusOpacity: 0.2,
        focusFloorStructureOpacity: false, // 聚焦楼层主体结构保持完全不透明
        easingFunction: 'Quadratic.InOut',
        showFacade: true,
        autoHideFacade: true,
        enableCameraAnimation: true,
        cameraAnimationDuration: 1500,
        cameraDistanceMultiplier: 1.5,
        cameraMinHeight: 15,
        restoreCameraOnUnfocus: true
    }

    private events: FloorControlEvents = {}

    // 在类中添加材质映射
    private materialsMap: Map<string, THREE.Material> = new Map()

    // 相机管理
    private cameraControls: any = null
    private originalCameraPosition: THREE.Vector3 | null = null
    private originalCameraTarget: THREE.Vector3 | null = null
    private cameraAnimationTween: TWEEN.Tween<any> | null = null
    
    // 调试模式
    private debugMode: boolean = false

    // 新增：统一的材质键格式生成器
    private generateMaterialKey(
        objectType: 'floor' | 'room' | 'equipment', 
        identifier: string | number, 
        meshUuid: string, 
        materialIndex: number
    ): string {
        return `${objectType}_${identifier}_${meshUuid}_${materialIndex}`
    }

    // 新增：检测是否为共享材质
    private isSharedMaterial(material: THREE.Material): boolean {
        if (!this.scene) return false
        
        let usageCount = 0
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                const materials = Array.isArray(object.material) ? object.material : [object.material]
                if (materials.includes(material)) {
                    usageCount++
                    if (usageCount > 1) return true // 提前退出优化
                }
            }
        })
        return usageCount > 1
    }

    // 新增：统一的材质透明度处理方法
    private applyOpacityWithMaterialCloning(
        mesh: THREE.Mesh, 
        opacity: number, 
        objectType: 'floor' | 'room' | 'equipment',
        identifier: string | number
    ): void {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        
        materials.forEach((material, index) => {
            if (!(material instanceof THREE.MeshBasicMaterial ||
                  material instanceof THREE.MeshLambertMaterial ||
                  material instanceof THREE.MeshPhongMaterial ||
                  material instanceof THREE.MeshStandardMaterial ||
                  material instanceof THREE.MeshPhysicalMaterial)) {
                return // 跳过不支持的材质类型
            }

            const key = this.generateMaterialKey(objectType, identifier, mesh.uuid, index)
            
            // 检查是否需要克隆材质
            if (!this.materialsMap.has(key)) {
                if (this.isSharedMaterial(material)) {
                    // 共享材质需要克隆
                    const clonedMaterial = material.clone()
                    clonedMaterial.userData.originalMaterial = material
                    clonedMaterial.userData.isClonedByPlugin = true
                    this.materialsMap.set(key, clonedMaterial)
                    
                    // 替换材质
                    if (Array.isArray(mesh.material)) {
                        mesh.material[index] = clonedMaterial
                    } else {
                        mesh.material = clonedMaterial
                    }
                } else {
                    // 非共享材质，直接使用但记录原始状态
                    if (material.userData.originalOpacity === undefined) {
                        material.userData.originalOpacity = material.opacity
                        material.userData.originalTransparent = material.transparent
                        material.userData.isModifiedByPlugin = true
                    }
                }
            }
            
            // 设置透明度
            const targetMaterial = this.materialsMap.get(key) || material
            targetMaterial.transparent = opacity < 1.0
            targetMaterial.opacity = opacity
            targetMaterial.needsUpdate = true
        })
    }

    // 新增：替换克隆材质为原始材质的辅助方法
    private replaceClonedMaterialWithOriginal(
        target: THREE.Object3D, 
        clonedMaterial: THREE.Material, 
        originalMaterial: THREE.Material
    ): void {
        target.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((mat, index) => {
                        if (mat === clonedMaterial) {
                            child.material[index] = originalMaterial
                        }
                    })
                } else {
                    if (child.material === clonedMaterial) {
                        child.material = originalMaterial
                    }
                }
            }
        })
        originalMaterial.needsUpdate = true
    }

    constructor(params: any = {}) {
        super(params)
        this.updateConfig(params.floorControlConfig || {})
        this.events = params.events || {}
        this.debugMode = params.debugMode || false

        eventBus.on('update', ()=>{
            this.activeTweens.update()
        })
    }

    public async init(scenePlugin?: any): Promise<void> {
        // 如果提供了场景对象，自动发现并设置建筑模型
        if (scenePlugin) {
            this.scene = scenePlugin.scene
            this.scenePlugin = scenePlugin
            // 初始化相机控制器
            if (scenePlugin.cameraControls) {
                this.cameraControls = scenePlugin.cameraControls
            }
        }

        // 设置可交互建筑模型
        if (this.setBuildingModel()) {
            // 解析所有设备列表
            this.parseAllEquipments()

            // 解析并链接建筑结构（非侵入式）
            const linkSuccess = this.linkParsedStructure()
            if (linkSuccess) {
                console.log('🏗️ 建筑控制插件初始化完成')
                
                // 输出建筑概览
                const overview = this.getBuildingOverview()
                console.log('📊 建筑概览:', overview)
            } else {
                console.warn('⚠️ 建筑结构链接失败，部分功能可能不可用')
            }
        } else {
            console.warn('⚠️ 未找到建筑模型，建筑控制功能不可用')
        }
    }

    /**
     * 更新配置
     * @param config 配置对象
     * @returns 更新后的配置对象
     */
    public updateConfig(config: FloorControlConfig): FloorControlConfig {
        this.config = {
            ...this.config,
            ...config
        }
        return this.config
    }

    /**
     * 设置可交互建筑模型
     * @returns 是否成功设置
     */
    public setBuildingModel(): boolean {
        this.scene?.children.forEach(child => {
            if (child.name === 'MAIN_BUILDING') {
                this.currentBuildingModel = child as THREE.Group
                return true
            }
        })
        if (this.currentBuildingModel) {
            return true
        } else {
            return false
        }
    }

    /**
     * 解析建筑模型
     * 内部子节点命名规则：
     * 楼层命名规则是：MAIN_BUILDING_1F、MAIN_BUILDING_2F、MAIN_BUILDING_nF。。。（数字n表示楼层）
     * 房间内部命名规则是：MAIN_BUILDING_1F_R101、MAIN_BUILDING_1F_K102。。。（某个字母+数字表示房间）
     * 外立面命名规则是：MAIN_BUILDING_MASK（名称里带有MASK字样）
     */
    public parseBuildingModel(): {
        success: boolean
        floors: Map<number, {
            floorObject: THREE.Object3D
            floorNumber: number
            rooms: Array<{
                roomObject: THREE.Object3D
                roomCode: string
            }>
            equipments: Array<{
                equipmentObject: THREE.Object3D
                equipmentName: string
                roomCode: string | null
                floorNumber: number
                roomObject: THREE.Object3D | null
            }>
        }>
        facades: THREE.Object3D[]
        statistics: {
            totalFloors: number
            totalRooms: number
            totalFacades: number
            totalEquipments: number
            unrecognizedObjects: THREE.Object3D[]
        }
        errors: string[]
    } {
        const result = {
            success: false,
            floors: new Map(),
            facades: [] as THREE.Object3D[],
            statistics: {
                totalFloors: 0,
                totalRooms: 0,
                totalFacades: 0,
                totalEquipments: 0,
                unrecognizedObjects: [] as THREE.Object3D[]
            },
            errors: [] as string[]
        }

        // 检查是否有当前建筑模型
        if (!this.currentBuildingModel) {
            result.errors.push('未设置建筑模型，请先调用 setBuildingModel() 方法')
            return result
        }

        console.log('🏗️ 开始解析建筑模型:', this.getModelName(this.currentBuildingModel))

        try {
            // 遍历建筑模型的所有子对象
            this.currentBuildingModel.traverse((child) => {
                // 跳过建筑模型本身
                if (child === this.currentBuildingModel) return

                const modelName = this.getModelName(child)
                const objectName = child.name || 'unnamed'
                
                // 解析外立面 (包含MASK关键词)
                if (this.isFacadeObject(modelName)) {
                    // 将解析信息挂载到userData
                    if (!child.userData) {
                        child.userData = {}
                    }
                    
                    child.userData.buildingInfo = {
                        type: 'facade',
                        buildingName: 'MAIN_BUILDING',
                        isFacade: true,
                    }
                    
                    result.facades.push(child)
                    return
                }

                // 解析楼层对象
                const floorInfo = this.parseFloorFromName(modelName)
                if (floorInfo.isFloor) {
                    this.processFloorObject(child, floorInfo.floorNumber, result)
                    return
                }

                // 解析房间对象
                const roomInfo = this.parseRoomFromName(modelName)
                if (roomInfo.isRoom) {
                    this.processRoomObject(child, roomInfo, result)
                    return
                }

                // 未识别的对象
                // 将解析信息挂载到userData（标记为未识别）
                if (!child.userData) {
                    child.userData = {}
                }
                
                // 将解析信息挂载到userData
                child.userData.buildingInfo = {
                    type: 'building',
                    buildingName: 'MAIN_BUILDING',
                    totalFloors: result.statistics.totalFloors,
                    totalRooms: result.statistics.totalRooms,
                    totalFacades: result.statistics.totalFacades,
                    unrecognizedObjects: result.statistics.unrecognizedObjects,
                    errors: result.errors,
                }
                
                result.statistics.unrecognizedObjects.push(child)
                console.warn(`⚠️ 未识别的对象: ${modelName} (${objectName})`)
            })

            // 计算统计信息
            result.statistics.totalFloors = result.floors.size
            result.statistics.totalFacades = result.facades.length
            result.statistics.totalRooms = Array.from(result.floors.values())
                .reduce((sum, floor) => sum + floor.rooms.length, 0)
            result.statistics.totalEquipments = Array.from(result.floors.values())
                .reduce((sum, floor) => sum + floor.equipments.length, 0)

            // 验证解析结果
            this.validateParsingResult(result)

            // 如果没有严重错误，标记为成功
            result.success = result.errors.length === 0

            // 输出解析报告
            if (this.debugMode) {
                this.generateParsingReport(result)
            }

        } catch (error) {
            const errorMsg = `解析建筑模型时发生错误: ${error instanceof Error ? error.message : String(error)}`
            result.errors.push(errorMsg)
            console.error('❌', errorMsg, error)
        }

        return result
    }

    /**
     * 判断是否为外立面对象
     */
    private isFacadeObject(modelName: string): boolean {
        const name = modelName.toLowerCase()
        const facadeKeywords = ['mask', 'facade', 'exterior', 'wall', 'curtain', '外立面', '立面', '幕墙']
        return facadeKeywords.some(keyword => name.includes(keyword))
    }

    /**
     * 从名称中解析楼层信息
     */
    private parseFloorFromName(modelName: string): {
        isFloor: boolean
        floorNumber: number
        buildingName: string | null
    } {
        // 楼层命名规则: MAIN_BUILDING_1F, MAIN_BUILDING_2F, MAIN_BUILDING_nF
        const floorPattern = /^(.+)_(\d+)F$/i
        const match = modelName.match(floorPattern)
        
        if (match) {
            const buildingName = match[1]
            const floorNumber = parseInt(match[2], 10)
            
            return {
                isFloor: true,
                floorNumber: floorNumber,
                buildingName: buildingName
            }
        }

        return {
            isFloor: false,
            floorNumber: 0,
            buildingName: null
        }
    }

    /**
     * 从名称中解析房间信息
     */
    private parseRoomFromName(modelName: string): {
        isRoom: boolean
        floorNumber: number
        roomCode: string
        buildingName: string | null
    } {
        // 房间命名规则: MAIN_BUILDING_1F_R101, MAIN_BUILDING_1F_K102
        const roomPattern = /^(.+)_(\d+)F_([A-Z])(\d+)$/i
        const match = modelName.match(roomPattern)
        
        if (match) {
            const buildingName = match[1]
            const floorNumber = parseInt(match[2], 10)
            const roomTypeCode = match[3].toUpperCase()
            const roomNumber = match[4]
            const roomCode = `${roomTypeCode}${roomNumber}`
            
            return {
                isRoom: true,
                floorNumber: floorNumber,
                roomCode: roomCode,
                buildingName: buildingName
            }
        } else {
            return {
                isRoom: false,
                floorNumber: 0,
                roomCode: '',
                buildingName: null
            }
        }
    }

    /**
     * 处理楼层对象
     */
    private processFloorObject(
        floorObject: THREE.Object3D, 
        floorNumber: number, 
        result: ReturnType<typeof this.parseBuildingModel>
    ): void {
        // 解析建筑名称
        const floorInfo = this.parseFloorFromName(this.getModelName(floorObject))
        
        // 将解析信息挂载到userData
        if (!floorObject.userData) {
            floorObject.userData = {}
        }
        
        floorObject.userData.buildingInfo = {
            type: 'floor',
            buildingName: floorInfo.buildingName || 'MAIN_BUILDING',
            floorNumber: floorNumber,
            equipments: [],
            rooms: [],
            isFloor: true,
        }

        this.floors.set(floorNumber,{
            group: floorObject,
            floorNumber: floorNumber,
            originalPosition: new THREE.Vector3(),
            targetPosition: new THREE.Vector3(),
            isVisible: true,
            opacity:1,
            nodeCount:0,
            associatedEquipment:[],
            rooms:[]
        })
        
        if (!result.floors.has(floorNumber)) {
            result.floors.set(floorNumber, {
                floorObject: floorObject,
                floorNumber: floorNumber,
                rooms: [],
                equipments: []
            })
            console.log(`🏢 发现楼层: ${floorNumber}F - ${this.getModelName(floorObject)}`)
        } else {
            result.errors.push(`发现重复的楼层: ${floorNumber}F`)
        }
    }

    /**
     * 处理房间对象
     */
    private processRoomObject(
        roomObject: THREE.Object3D,
        roomInfo: ReturnType<typeof this.parseRoomFromName>,
        result: ReturnType<typeof this.parseBuildingModel>
    ): void {
        const floorNumber = roomInfo.floorNumber
        
        // 将解析信息挂载到userData
        if (!roomObject.userData) {
            roomObject.userData = {}
        }
        
        roomObject.userData.buildingInfo = {
            type: 'room',
            buildingName: roomInfo.buildingName || 'MAIN_BUILDING',
            floorNumber: floorNumber,
            roomCode: roomInfo.roomCode,
            isRoom: true,
            equipments: [],// 关联的设备列表
        }
        
        // 确保楼层存在
        if (!result.floors.has(floorNumber)) {
            // 如果楼层不存在，创建一个虚拟楼层记录
            result.floors.set(floorNumber, {
                floorObject: null as any, // 将在后续处理中补充
                floorNumber: floorNumber,
                rooms: [],
                equipments: []
            })

            console.warn(`⚠️ 为房间 ${roomInfo.roomCode} 创建了虚拟楼层 ${floorNumber}F`)
        }
        let floor = this.floors.get(floorNumber)

        floor&&floor.rooms.push({
            group: roomObject as THREE.Group,
            roomNumber: roomInfo.roomCode,
            originalPosition: roomObject.position.clone(),
            targetPosition: roomObject.position.clone(),
            isVisible: true,
            opacity: 1.0,
            floorNumber,
            associatedEquipment: [], // 后续通过设备关联功能填充
        })

        this.rooms.set(roomInfo.roomCode,{
            group:roomObject,
            roomNumber:roomInfo.roomCode,
            originalPosition: roomObject.position.clone(),
            targetPosition: roomObject.position.clone(),
            isVisible:true,
            floorNumber,
            opacity:1,
            associatedEquipment:[]
        })

        // 提取并保存房间地板轮廓
        this.extractAndSaveRoomBounding(roomObject, roomInfo.roomCode)
    }

    /**
     * 验证解析结果
     */
    private validateParsingResult(result: ReturnType<typeof this.parseBuildingModel>): void {
        // 检查是否有楼层
        if (result.floors.size === 0) {
            result.errors.push('未发现任何楼层，请检查命名规则是否正确')
        }

        // 检查楼层连续性
        const floorNumbers = Array.from(result.floors.keys()).sort((a, b) => a - b)
        for (let i = 0; i < floorNumbers.length - 1; i++) {
            if (floorNumbers[i + 1] - floorNumbers[i] > 1) {
                result.errors.push(`楼层不连续: 缺少 ${floorNumbers[i] + 1}F 到 ${floorNumbers[i + 1] - 1}F`)
            }
        }

        // 检查是否有虚拟楼层（只有房间没有楼层对象）
        result.floors.forEach((floor, floorNumber) => {
            if (!floor.floorObject) {
                result.errors.push(`楼层 ${floorNumber}F 只有房间没有楼层主体对象`)
            }
        })

        // 检查外立面
        if (result.facades.length === 0) {
            console.warn('⚠️ 未发现外立面对象，建筑可能没有外立面或命名不符合规则')
        }

        // 检查未识别对象
        if (result.statistics.unrecognizedObjects.length > 0) {
            console.warn(`⚠️ 发现 ${result.statistics.unrecognizedObjects.length} 个未识别的对象`)
        }

    }

    /**
     * 生成解析报告
     */
    private generateParsingReport(result: ReturnType<typeof this.parseBuildingModel>): void {
        console.log('📊 建筑模型解析报告:')
        console.log(`   🏢 总楼层数: ${result.statistics.totalFloors}`)
        console.log(`   🏠 总房间数: ${result.statistics.totalRooms}`)
        console.log(`   🎭 外立面数: ${result.statistics.totalFacades}`)
        console.log(`   ❓ 未识别对象: ${result.statistics.unrecognizedObjects.length}`)

        if (result.floors.size > 0) {
            console.log('   📋 楼层详情:')
            const sortedFloors = Array.from(result.floors.entries()).sort(([a], [b]) => a - b)
            sortedFloors.forEach(([floorNumber, floor]) => {
                const roomList = floor.rooms.map(room => `${room.roomCode}`).join(', ')
                console.log(`      ${floorNumber}F: ${floor.rooms.length}个房间 [${roomList}]`)
            })
        }

        if (result.facades.length > 0) {
            console.log('   🎭 外立面详情:')
            result.facades.forEach((facade, index) => {
                console.log(`      ${index + 1}. ${this.getModelName(facade)}`)
            })
        }

        if (result.errors.length > 0) {
            console.log('   ❌ 错误信息:')
            result.errors.forEach((error, index) => {
                console.log(`      ${index + 1}. ${error}`)
            })
        }

        if (result.statistics.unrecognizedObjects.length > 0) {
            console.log('   ❓ 未识别对象详情:')
            result.statistics.unrecognizedObjects.forEach((obj, index) => {
                console.log(`      ${index + 1}. ${this.getModelName(obj)} (${obj.name})`)
            })
        }

        console.log(`✅ 解析${result.success ? '成功' : '完成(有错误)'}`)
    }

    /**
     * 获取对象的模型名称（优先从userData.modelName读取）
     */
    private getModelName(object: THREE.Object3D): string {
        if (!object) return '未命名模型'

        // 优先使用userData.modelName（新的命名规则）
        if (object.userData && object.userData.modelName) {
            return object.userData.modelName
        }

        // 向后兼容：如果userData.modelName不存在，使用object.name
        return object.name || '未命名模型'
    }



    /**
     * 链接解析结果到插件属性（非侵入式）
     * 将parseBuildingModel的解析结果映射到插件的管理属性中，不修改原始模型结构
     */
    public linkParsedStructure(): boolean {
        // 首先解析建筑模型
        const parseResult = this.parseBuildingModel()
        
        if (!parseResult.success) {
            console.error('❌ 解析建筑模型失败，无法链接结构')
            return false
        }

        // 保存解析结果
        this.parseResult = parseResult

        try {
            // 清空现有数据
            this.floors.clear()
            this.facades = []
            // this.rooms.clear()

            // 链接楼层和房间
            this.linkFloors(parseResult)
            
            // 链接外立面
            this.linkFacades(parseResult)
            
            // // 链接房间索引
            this.linkRooms(parseResult)

            // 关联设备到楼层和房间
            this.associateEquipmentToFloorsAndRooms()

            console.log('✅ 建筑结构链接完成', {
                楼层数: this.floors.size,
                房间数: this.rooms.size / 2, // 除以2因为每个房间有两个键
                外立面数: this.facades.length,
                设备数: this.allDevices.length
            })
            
            // 输出房间详细信息
            console.log('🏠 最终房间列表:', Array.from(this.rooms.keys()).filter(key => !key.includes('F_')))
            console.log('🏠 rooms Map 对象:', this.rooms)

            return true

        } catch (error) {
            console.error('❌ 链接建筑结构时发生错误:', error)
            return false
        }
    }

    /**
     * 链接楼层结构（非侵入式）
     */
    private linkFloors(parseResult: ReturnType<typeof this.parseBuildingModel>): void {
        parseResult.floors.forEach((floorData, floorNumber) => {
            // 创建楼层管理项（不修改原始对象）
            const floorItem: FloorItem = {
                group: floorData.floorObject as THREE.Group, // 直接引用原始对象
                floorNumber: floorNumber,
                originalPosition: floorData.floorObject.position.clone(), // 克隆位置避免引用
                targetPosition: floorData.floorObject.position.clone(),
                isVisible: true,
                opacity: 1.0,
                nodeCount: this.countNodes(floorData.floorObject),
                associatedEquipment: [], // 后续通过设备关联功能填充
                rooms: this.createRoomItems(floorData.rooms,floorNumber) // 创建房间管理项
            }

            this.floors.set(floorNumber, floorItem)
            
            console.log(`🔗 链接楼层: ${floorNumber}F (${floorData.rooms.length}个房间)`)
        })
    }

    /**
     * 创建房间管理项（非侵入式）
     */
    private createRoomItems(roomsData: Array<{
        roomObject: THREE.Object3D
        roomCode: string
    }>,floorNumber:number): RoomItem[] {
        return roomsData.map(roomData => ({
            group: roomData.roomObject as THREE.Group, // 直接引用原始对象
            roomNumber: roomData.roomCode,
            originalPosition: roomData.roomObject.position.clone(),
            targetPosition: roomData.roomObject.position.clone(),
            floorNumber,
            isVisible: true,
            opacity: 1.0,
            associatedEquipment: [] // 后续通过设备关联功能填充
        }))
    }

    /**
     * 链接外立面（非侵入式）
     */
    private linkFacades(parseResult: ReturnType<typeof this.parseBuildingModel>): void {
        this.facades = [...parseResult.facades] // 浅拷贝数组，保持对象引用
        
        // 设置主要外立面组（如果存在）
        if (this.facades.length > 0) {
            this.facadeGroup = this.facades[0] as THREE.Group
            console.log(`🔗 链接外立面: ${this.facades.length}个对象`)
        }
    }

    /**
     * 链接房间索引（非侵入式）
     */
    private linkRooms(parseResult: ReturnType<typeof this.parseBuildingModel>): void {
        // parseResult.floors.forEach((floorData,floorNumber) => {
        //     floorData.rooms.forEach(roomData => {
        //         // 创建房间管理项
        //         const roomItem: RoomItem = {
        //             group: roomData.roomObject as THREE.Group,
        //             roomNumber: roomData.roomCode,
        //             floorNumber,
        //             originalPosition: roomData.roomObject.position.clone(),
        //             targetPosition: roomData.roomObject.position.clone(),
        //             isVisible: true,
        //             opacity: 1.0,
        //             associatedEquipment: []
        //         }
                
        //         console.log(roomItem,"单个房间",roomData.roomCode)
        //         // 使用房间代码作为键
        //         this.rooms.set(roomData.roomCode, roomItem)

        //         console.log("🏠 房间已链接:", roomData.roomCode, "当前总数:", this.rooms.size)
        //     })
        // })
        
        // console.log(`🔗 房间索引创建完成: ${this.rooms.size / 2}个房间`) // 除以2因为每个房间有两个键
        // 遍历所有房间,将房间挂载至楼层对象上面
        this.rooms.forEach((item, key)=>{
            console.log(item, key)
            let floor = this.floors.get(item.floorNumber)
            floor&&floor.rooms.push(item)
        })
    
    }

    /**
     * 计算对象节点数量
     */
    private countNodes(object: THREE.Object3D): number {
        let count = 0
        object.traverse(() => count++)
        return count - 1 // 减去对象自身
    }

    /**
     * 提取mesh顶面轮廓顶点
     * @param mesh 要提取轮廓的mesh对象
     * @returns 顶面轮廓顶点数组（世界坐标）
     */
    private extractTopFaceVertices(mesh: THREE.Mesh): THREE.Vector3[] {
        const geometry = mesh.geometry
        if (!geometry.attributes.position) {
            console.warn('⚠️ Mesh没有position属性，无法提取顶面轮廓')
            return []
        }

        const verticesArray = geometry.attributes.position.array
        const vertices: THREE.Vector3[] = []
        
        // 获取所有顶点的Y值，找到最大值
        let maxY = -Infinity
        for (let i = 0; i < verticesArray.length; i += 3) {
            const y = verticesArray[i + 1]
            if (y > maxY) {
                maxY = y
            }
        }
        
        // 筛选Y值最大的顶点（顶面顶点）
        const topVertices: THREE.Vector3[] = []
        const tolerance = 0.001 // 容差值，处理浮点数精度问题
        
        for (let i = 0; i < verticesArray.length; i += 3) {
            const x = verticesArray[i]
            const y = verticesArray[i + 1]
            const z = verticesArray[i + 2]
            
            if (Math.abs(y - maxY) < tolerance) {
                const vertex = new THREE.Vector3(x, y, z)
                // 转换到世界坐标
                vertex.applyMatrix4(mesh.matrixWorld)
                
                // 检查是否已存在相同的顶点（去重）
                const isDuplicate = topVertices.some(existing => 
                    vertex.distanceTo(existing) < tolerance
                )
                
                if (!isDuplicate) {
                    topVertices.push(vertex)
                }
            }
        }
        
        if (topVertices.length < 3) {
            console.warn('⚠️ 顶面顶点数量不足，无法构成有效轮廓')
            return []
        }
        
        // 计算顶点的中心点
        const center = new THREE.Vector3()
        topVertices.forEach(v => center.add(v))
        center.divideScalar(topVertices.length)
        
        // 按照逆时针方向排序顶点（从上方看）
        topVertices.sort((a, b) => {
            const angleA = Math.atan2(a.z - center.z, a.x - center.x)
            const angleB = Math.atan2(b.z - center.z, b.x - center.x)
            return angleA - angleB
        })
        
        return topVertices
    }

    /**
     * 为房间对象提取并保存轮廓信息
     * @param roomObject 房间3D对象
     * @param roomCode 房间代码
     */
    private extractAndSaveRoomBounding(roomObject: THREE.Object3D, roomCode: string): void {
        const meshes: THREE.Mesh[] = []
        
        // 查找房间中的所有mesh
        roomObject.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshes.push(child)
            }
        })
        
        if (meshes.length === 0) {
            console.warn(`⚠️ 房间 ${roomCode} 中未找到任何mesh`)
            return
        }
        
        // 选择面积最大的mesh作为地板
        let floorMesh = meshes[0]
        let maxArea = 0
        
        for (const mesh of meshes) {
            const box = new THREE.Box3().setFromObject(mesh)
            const size = box.getSize(new THREE.Vector3())
            const area = size.x * size.z // X-Z平面的面积（地板面积）
            
            if (area > maxArea) {
                maxArea = area
                floorMesh = mesh
            }
        }
        
        try {
            // 提取顶面轮廓
            const boundingVertices = this.extractTopFaceVertices(floorMesh)
            
            if (boundingVertices.length > 0) {
                // 将轮廓信息保存到房间的userData中
                if (!roomObject.userData) {
                    roomObject.userData = {}
                }
                
                roomObject.userData.bounding = {
                    vertices: boundingVertices.map(v => ({ x: v.x, y: v.y, z: v.z })),
                    vertexCount: boundingVertices.length,
                    center: {
                        x: boundingVertices.reduce((sum, v) => sum + v.x, 0) / boundingVertices.length,
                        y: boundingVertices.reduce((sum, v) => sum + v.y, 0) / boundingVertices.length,
                        z: boundingVertices.reduce((sum, v) => sum + v.z, 0) / boundingVertices.length
                    },
                    extractedAt: Date.now(),
                    meshName: floorMesh.name || 'unnamed_floor_mesh'
                }
                
                console.log(`✅ 房间 ${roomCode} 轮廓提取完成，顶点数: ${boundingVertices.length}`)
                
                if (this.debugMode) {
                    console.log(`🔍 房间 ${roomCode} 轮廓详情:`, roomObject.userData.bounding)
                }
            } else {
                console.warn(`⚠️ 房间 ${roomCode} 轮廓提取失败：没有有效的顶面顶点`)
            }
        } catch (error) {
            console.error(`❌ 房间 ${roomCode} 轮廓提取出错:`, error)
        }
    }

    /**
     * 获取楼层对象（非侵入式访问）
     * @param floorNumber 楼层号
     * @returns 楼层对象，如果不存在返回null
     */
    public getFloorObject(floorNumber: number): THREE.Object3D | null {
        const floor = this.floors.get(floorNumber)
        return floor ? floor.group : null
    }

    /**
     * 获取房间对象（非侵入式访问）
     * @param roomCode 房间代码（如 "R101" 或 "1F_R101"）
     * @returns 房间对象，如果不存在返回null
     */
    public getRoomObject(roomCode: string): THREE.Object3D | null {
        return this.rooms.get(roomCode)?.group || null
    }

    /**
     * 获取外立面对象列表（非侵入式访问）
     * @returns 外立面对象数组
     */
    public getFacadeObjects(): THREE.Object3D[] {
        return [...this.facades] // 返回副本避免外部修改
    }

    /**
     * 获取指定楼层的房间列表（非侵入式访问）
     * @param floorNumber 楼层号
     * @returns 房间对象数组
     */
    public getFloorRooms(floorNumber: number): THREE.Object3D[] {
        const floor = this.floors.get(floorNumber)
        return floor ? floor.rooms.map((room: RoomItem) => room.group) : []
    }

    /**
     * 获取完整的解析结果（只读）
     * @returns 解析结果的副本
     */
    public getParseResult(): ReturnType<typeof this.parseBuildingModel> | null {
        return this.parseResult ? { ...this.parseResult } : null
    }

    /**
     * 检查结构是否已链接
     * @returns 是否已成功链接
     */
    public isStructureLinked(): boolean {
        return this.parseResult !== null && this.parseResult.success
    }

    /**
     * 获取建筑结构概览
     * @returns 建筑结构统计信息
     */
    public getBuildingOverview(): {
        isLinked: boolean
        totalFloors: number
        totalRooms: number
        totalFacades: number
        floorNumbers: number[]
        roomCodes: string[]
    } {
        if (!this.isStructureLinked()) {
            return {
                isLinked: false,
                totalFloors: 0,
                totalRooms: 0,
                totalFacades: 0,
                floorNumbers: [],
                roomCodes: []
            }
        }

        return {
            isLinked: true,
            totalFloors: this.floors.size,
            totalRooms: this.rooms.size,
            totalFacades: this.facades.length,
            floorNumbers: Array.from(this.floors.keys()).sort((a, b) => a - b),
            roomCodes: Array.from(this.rooms.keys()).filter((key: string) => !key.includes('F_')) // 只返回简单房间代码
        }
    }

    /**
     * 楼层展开（执行动画）
     * 将所有楼层在垂直方向上展开，其他楼层之间相互分离（具有一个渐进的补间动画）
     */
    public expandFloor(): void {
        // 检查是否有楼层可以展开
        if (this.floors.size === 0) {
            console.warn(`⚠️ 没有楼层可以展开`)
            return
        }

        // 如果已经是展开状态，则不重复执行
        if (this.currentState === FloorState.EXPANDED) {
            console.log(`ℹ️ 楼层已处于展开状态`)
            return
        }

        console.log(`🏗️ 开始展开所有楼层`)

        // 触发展开开始事件
        this.events.onExpandStart?.()

        // 停止所有活动的动画
        this.stopAllAnimations()

        // 如果配置了自动隐藏外立面，则隐藏外立面
        if (this.config.autoHideFacade) {
            this.hideFacades()
        }

        // 计算所有楼层的展开目标位置
        this.calculateExpandedPositions()

        // 执行展开动画
        this.executeExpandAnimation(() => {
            // 动画完成后的回调
            this.currentState = FloorState.EXPANDED
            this.events.onExpandComplete?.()
            console.log(`✅ 所有楼层展开完成`)
        })
    }
    
    /**
     * 楼层收起（执行动画）
     * 将展开的楼层恢复到原始位置（具有一个渐进的补间动画）
     */
    public collapseFloor(): void {
        // 检查是否有楼层可以收起
        if (this.floors.size === 0) {
            console.warn(`⚠️ 没有楼层可以收起`)
            return
        }

        // 如果已经是正常状态，则不重复执行
        if (this.currentState === FloorState.NORMAL) {
            console.log(`ℹ️ 楼层已处于正常状态`)
            return
        }

        console.log(`🏗️ 开始收起所有楼层`)

        // 触发收起开始事件
        this.events.onCollapseStart?.()

        // 停止所有活动的动画
        this.stopAllAnimations()

        // 执行收起动画
        this.executeCollapseAnimation(() => {
            // 动画完成后的回调
            this.currentState = FloorState.NORMAL
            this.focusedFloor = null
            
            // 恢复外立面显示
            this.showFacades()
            
            // 恢复所有楼层透明度
            this.restoreAllFloorOpacity()
            
            this.events.onCollapseComplete?.()
            console.log(`✅ 所有楼层收起完成`)
        })
    }
    
    /**
     * 楼层聚焦（执行动画）
     * 聚焦到指定楼层，其他楼层变为半透明
     */
    public focusFloor(floorNumber: number): void {
        const floor = this.floors.get(floorNumber)
        if (!floor) {
            console.warn(`⚠️ 楼层 ${floorNumber}F 不存在，无法聚焦`)
            return
        }

        console.log(`🎯 开始聚焦楼层 ${floorNumber}F`)

        // 如果已经聚焦到同一楼层，则不执行操作
        if (this.focusedFloor === floorNumber && this.currentState === FloorState.FOCUSED) {
            console.log(`ℹ️ 楼层 ${floorNumber}F 已经处于聚焦状态`)
            return
        }

        // 停止所有活动的动画
        this.stopAllAnimations()

        // 更新状态
        this.currentState = FloorState.FOCUSED
        this.focusedFloor = floorNumber

        // 设置楼层透明度
        this.setFloorsOpacityForFocus(floorNumber)

        // 如果启用了相机动画，则移动相机到聚焦楼层
        if (this.config.enableCameraAnimation) {
            this.animateCameraToFloor(floorNumber, () => {
                this.events.onCameraAnimationComplete?.(floorNumber)
            })
        }

        // 触发聚焦事件
        this.events.onFloorFocus?.(floorNumber)
        console.log(`✅ 楼层 ${floorNumber}F 聚焦完成`)
    }

    /**
     * 展开所有楼层（兼容性方法，内部调用expandFloor）
     */
    public expandAllFloors(): void {
        this.expandFloor()
    }

    /**
     * 收起所有楼层（兼容性方法，内部调用collapseFloor）
     */
    public collapseAllFloors(): void {
        this.collapseFloor()
    }

    /**
     * 取消楼层聚焦，恢复正常状态
     */
    public unfocusAllFloors(): void {
        if (this.currentState !== FloorState.FOCUSED) {
            console.log(`ℹ️ 当前没有楼层处于聚焦状态`)
            return
        }

        console.log(`🎯 取消楼层聚焦`)

        // 停止所有活动的动画
        this.stopAllAnimations()

        // 恢复所有楼层透明度
        this.restoreAllFloorOpacity()

        // 更新状态
        this.currentState = FloorState.EXPANDED
        this.focusedFloor = null

        // 如果启用了相机恢复，则恢复相机位置
        if (this.config.restoreCameraOnUnfocus && this.originalCameraPosition) {
            this.restoreCameraPosition(() => {
                this.events.onCameraRestore?.()
            })
        }

        // 触发取消聚焦事件
        this.events.onFloorUnfocus?.()
        console.log(`✅ 楼层聚焦已取消`)
    }

    /**
     * 计算展开状态下所有楼层的目标位置
     */
    private calculateExpandedPositions(): void {
        const floorNumbers = Array.from(this.floors.keys()).sort((a, b) => a - b);
        const expandDistance = this.config.expandDistance;
        const lowestFloor = Math.min(...floorNumbers);
      
        floorNumbers.forEach((floorNumber, index) => {
          const floor = this.floors.get(floorNumber)!;
      
          // 以最低楼层为基准，向上依次展开（等距）
          const verticalOffset = (floorNumber - lowestFloor) * expandDistance;
      
          floor.targetPosition = floor.originalPosition.clone();
          floor.targetPosition.y += verticalOffset;
      
          // 同时设置房间的目标位置为与楼层同步
          floor.rooms.forEach(room => {
            room.targetPosition = room.originalPosition.clone();
            room.targetPosition.y += verticalOffset;
          });
        });
      }

    /**
     * 执行展开动画
     * 使用渐进式动画，楼层依次展开，创建视觉层次感
     */
    private executeExpandAnimation(onComplete?: () => void): void {
        const floorNumbers = Array.from(this.floors.keys()).sort((a, b) => a - b);
        const lowestFloor = Math.min(...floorNumbers);
      
        if (floorNumbers.length === 0) {
          console.warn('⚠️ 没有楼层可以展开');
          onComplete?.();
          return;
        }
      
        const animationPromises: Promise<void>[] = [];
      
        floorNumbers.forEach((floorNumber, index) => {
          const floor = this.floors.get(floorNumber)!;
      
          // 计算当前楼层的总偏移量（等距）
          const verticalOffset = (floorNumber - lowestFloor) * this.config.expandDistance;
      
          const promise = new Promise<void>((resolve) => {
            const delay = index * 200;
            const timeoutId = setTimeout(() => {
              const positionTween = new TWEEN.Tween(floor.group.position)
                .to(floor.targetPosition, this.config.animationDuration)
                .easing(this.getEasingFunction())
                .onUpdate(() => {
                  // 同步房间的 y 坐标
                  floor.rooms.forEach(item => {
                    const room = item.group;
                    if (room.userData.originalY === undefined) {
                      room.userData.originalY = room.position.y;
                    }
                    room.position.y = room.userData.originalY + floor.group.position.y - floor.originalPosition.y;
                  });
      
                  // 同步设备的 y 坐标
                  floor.associatedEquipment.forEach(equipmentInfo => {
                    const equipment = equipmentInfo.equipment;
                    if (equipment.userData.originalY === undefined) {
                      equipment.userData.originalY = equipment.position.y;
                    }
                    equipment.position.y = equipment.userData.originalY + floor.group.position.y - floor.originalPosition.y;
                  });
                })
                .onComplete(() => {
                  console.log(`✅ 楼层 ${floorNumber}F 展开完成`);
                  resolve();
                });
      
              this.activeTweens.add(positionTween);
              positionTween.start();
            }, delay);
      
            this.delayedAnimationTimeouts.push(timeoutId);
          });
      
          animationPromises.push(promise);
        });
      
        Promise.all(animationPromises).then(() => {
          onComplete?.();
        });
    }

    /**
     * 执行收起动画
     * 使用反向渐进式动画，楼层依次收起
     */
    private executeCollapseAnimation(onComplete?: () => void): void {
        const floorNumbers = Array.from(this.floors.keys()).sort((a, b) => b - a) // 从高到低收起
        
        if (floorNumbers.length === 0) {
            console.warn('⚠️ 没有楼层可以收起')
            onComplete?.()
            return
        }

        // 创建反向渐进式动画序列
        const animationPromises: Promise<void>[] = []

        floorNumbers.forEach((floorNumber, index) => {
            const floor = this.floors.get(floorNumber)!
            const delay = index * 150 // 收起动画稍快一些

            const promise = new Promise<void>((resolve) => {
                // 延迟执行动画
                const timeoutId = setTimeout(() => {
                    const startPosition = floor.group.position.clone()
                    const endPosition = floor.originalPosition.clone()

                    // 创建位置动画
                    const positionTween = new TWEEN.Tween(startPosition)
                        .to(endPosition, this.config.animationDuration)
                        .easing(this.getEasingFunction())
                        .onUpdate(() => {
                            const deltaY = startPosition.y - floor.originalPosition.y
                            
                            // 移动楼层
                            floor.group.position.copy(startPosition)
                            
                            // 恢复房间位置（修复遗漏的房间位置同步）
                            floor.rooms.forEach(roomItem => {
                                const room = roomItem.group
                                if (room.userData.originalY !== undefined) {
                                    room.position.y = room.userData.originalY + deltaY
                                    if (this.debugMode) {
                                        console.log(`🏠 收起房间 ${roomItem.roomNumber}: originalY=${room.userData.originalY}, deltaY=${deltaY}, newY=${room.position.y}`)
                                    }
                                } else if (this.debugMode) {
                                    console.warn(`⚠️ 房间 ${roomItem.roomNumber} 缺少 originalY 数据`)
                                }
                            })
                            
                            // 恢复关联设备位置
                            floor.associatedEquipment.forEach(equipmentInfo => {
                                const equipment = equipmentInfo.equipment
                                if (equipment.userData.originalY !== undefined) {
                                    equipment.position.y = equipment.userData.originalY + deltaY
                                }
                            })
                        })
                        .onComplete(() => {
                            // 清理房间的临时数据
                            floor.rooms.forEach(roomItem => {
                                const room = roomItem.group
                                if (room.userData.originalY !== undefined) {
                                    delete room.userData.originalY
                                }
                            })
                            
                            // 清理设备的临时数据
                            floor.associatedEquipment.forEach(equipmentInfo => {
                                const equipment = equipmentInfo.equipment
                                if (equipment.userData.originalY !== undefined) {
                                    delete equipment.userData.originalY
                                }
                            })
                            
                            console.log(`✅ 楼层 ${floorNumber}F 收起完成`)
                            resolve()
                        })

                    this.activeTweens.add(positionTween)
                    positionTween.start()
                }, delay)

                // 保存定时器ID以便后续清理
                this.delayedAnimationTimeouts.push(timeoutId)
            })

            animationPromises.push(promise)
        })

        // 等待所有动画完成
        Promise.all(animationPromises).then(() => {
            onComplete?.()
        })
    }

    /**
     * 设置楼层聚焦时的透明度
     */
    private setFloorsOpacityForFocus(focusedFloorNumber: number): void {
        this.floors.forEach((floor, floorNumber) => {
            if (floorNumber === focusedFloorNumber) {
                // 聚焦楼层：根据配置决定楼层主体透明度
                const floorOpacity = this.config.focusFloorStructureOpacity 
                    ? this.config.focusOpacity 
                    : 1.0 // 如果配置为false，楼层主体完全不透明
                
                this.setFloorOpacity(floor, floorOpacity)
                
                // 聚焦楼层的设备透明度
                floor.associatedEquipment.forEach(equipmentInfo => {
                    const equipment = equipmentInfo.equipment
                    this.setEquipmentOpacity(equipment, this.config.focusOpacity)
                })

                floor.rooms.forEach(room =>{
                    const roomObject = room.group
                    this.setRoomOpacity(roomObject, this.config.focusOpacity)  
                })

            } else {
                // 非聚焦楼层：楼层主体和设备都设置为半透明
                this.setFloorOpacity(floor, this.config.unfocusOpacity)
                
                // 非聚焦楼层的设备也设置为半透明
                floor.associatedEquipment.forEach(equipmentInfo => {
                    const equipment = equipmentInfo.equipment
                    this.setEquipmentOpacity(equipment, this.config.unfocusOpacity)
                })
                
                floor.rooms.forEach(room =>{
                    const roomObject = room.group
                    this.setRoomOpacity(roomObject,this.config.unfocusOpacity)  
                })
            }
        })
    }

    /**
     * 设置楼层透明度
     */
    private setFloorOpacity(floor: FloorItem, opacity: number): void {
        floor.group.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                this.applyOpacityWithMaterialCloning(child, opacity, 'floor', floor.floorNumber)
            }
        })
        floor.opacity = opacity
    }
    /**
     * 设置设备透明度
     * @param equipment 设备对象
     * @param opacity 透明度值 (0-1)
     */
    private setEquipmentOpacity(equipment: THREE.Object3D|THREE.Scene|THREE.Group, opacity: number): void {
        // 遍历设备的所有材质并设置透明度
        equipment.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                this.applyOpacityWithMaterialCloning(child, opacity, 'equipment', equipment.uuid)
            }
        })
    }

    private setRoomOpacity(room: THREE.Object3D|THREE.Scene|THREE.Group, opacity: number): void {
        room.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                this.applyOpacityWithMaterialCloning(child, opacity, 'room', room.name || room.uuid)
            }
        })
    }

    /**
     * 统一的恢复透明度方法
     * @param target 3D对象
     * @param objectType 对象类型
     * @param identifier 对象标识符
     */
    private restoreObjectOpacity(
        target: THREE.Object3D | THREE.Scene | THREE.Group,
        objectType: 'floor' | 'room' | 'equipment',
        identifier: string | number
    ): void {
        const prefix = `${objectType}_${identifier}_`
        
        // 找到所有相关的材质映射并恢复
        const keysToRestore = Array.from(this.materialsMap.keys())
            .filter(key => key.startsWith(prefix))
        
        keysToRestore.forEach(key => {
            const clonedMaterial = this.materialsMap.get(key)!
            const originalMaterial = clonedMaterial.userData.originalMaterial as THREE.Material
            
            if (originalMaterial) {
                // 恢复到原始材质
                this.replaceClonedMaterialWithOriginal(target, clonedMaterial, originalMaterial)
                // 清理克隆材质
                clonedMaterial.dispose()
            }
            
            this.materialsMap.delete(key)
        })
        
        // 恢复非共享材质的透明度（直接修改的材质）
        target.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material]
                materials.forEach(material => {
                    if (material.userData.isModifiedByPlugin && 
                        material.userData.originalOpacity !== undefined) {
                        material.opacity = material.userData.originalOpacity
                        material.transparent = material.userData.originalTransparent || false
                        material.needsUpdate = true
                        
                        // 清理标记
                        delete material.userData.originalOpacity
                        delete material.userData.originalTransparent
                        delete material.userData.isModifiedByPlugin
                    }
                })
            }
        })
    }

    /**
     * 恢复原始透明度（向后兼容方法）
     * @param target 3D对象
     */
    private restoreTargetOpacity(target: THREE.Object3D | THREE.Scene | THREE.Group): void {
        // 对于设备，使用UUID作为标识符
        this.restoreObjectOpacity(target, 'equipment', target.uuid)
    }

    /**
     * 恢复所有楼层透明度
     */
    private restoreAllFloorOpacity(): void {
        this.floors.forEach((floor) => {
            // 恢复楼层材质到原始状态
            this.restoreObjectOpacity(floor.group, 'floor', floor.floorNumber)
            
            // 恢复关联设备的透明度
            floor.associatedEquipment.forEach(equipmentInfo => {
                const equipment = equipmentInfo.equipment
                this.restoreObjectOpacity(equipment, 'equipment', equipment.uuid)
            })

            floor.rooms.forEach(room => {
                this.restoreObjectOpacity(room.group, 'room', room.roomNumber)
            })
            
            // 更新楼层状态
            floor.opacity = 1.0
        })
    }

    /**
     * 恢复单个楼层的原始透明度
     */
    private restoreFloorOpacity(floor: FloorItem): void {
        this.restoreObjectOpacity(floor.group, 'floor', floor.floorNumber)
        floor.opacity = 1.0
    }
    

    /**
     * 恢复单个房间的透明度
     */
    private restoreRoomOpacity(roomGroup: THREE.Object3D | THREE.Scene | THREE.Group): void {
        this.restoreObjectOpacity(roomGroup, 'room', roomGroup.name || roomGroup.uuid)
    }
    
    /**
     * 隐藏外立面
     */
    private hideFacades(): void {
        this.facades.forEach((facade: THREE.Object3D) => {
            if (facade.visible) {
                facade.visible = false
                this.hiddenFacades.push(facade)
            }
        })
    }

    /**
     * 显示外立面
     */
    private showFacades(): void {
        this.hiddenFacades.forEach((facade) => {
            facade.visible = true
        })
        this.hiddenFacades = []
    }

    /**
     * 相机动画到指定楼层
     */
    private animateCameraToFloor(floorNumber: number, onComplete?: () => void): void {
        if (!this.cameraControls) {
            console.warn('⚠️ 相机控制器未初始化，无法执行相机动画')
            onComplete?.()
            return
        }

        const floor = this.floors.get(floorNumber)
        if (!floor) {
            console.warn(`⚠️ 楼层 ${floorNumber}F 不存在，无法执行相机动画`)
            onComplete?.()
            return
        }

        // 保存原始相机位置（如果还没有保存）
        if (!this.originalCameraPosition && this.cameraControls.object) {
            this.originalCameraPosition = this.cameraControls.object.position.clone()
            this.originalCameraTarget = this.cameraControls.target.clone()
        }

        // 触发相机动画开始事件
        this.events.onCameraAnimationStart?.(floorNumber)

        // 计算目标相机位置
        const floorBoundingBox = new THREE.Box3().setFromObject(floor.group)
        const floorCenter = floorBoundingBox.getCenter(new THREE.Vector3())
        const floorSize = floorBoundingBox.getSize(new THREE.Vector3())
        
        const distance = Math.max(floorSize.x, floorSize.z) * this.config.cameraDistanceMultiplier
        const height = Math.max(this.config.cameraMinHeight, floorCenter.y + distance * 0.5)

        const targetCameraPosition = new THREE.Vector3(
            floorCenter.x + distance,
            height,
            floorCenter.z + distance
        )

        // 创建相机动画
        const startPosition = this.cameraControls.object.position.clone()
        const startTarget = this.cameraControls.target.clone()

        const cameraPositionTween = new TWEEN.Tween(startPosition)
            .to(targetCameraPosition, this.config.cameraAnimationDuration)
            .easing(this.getEasingFunction())

        const cameraTargetTween = new TWEEN.Tween(startTarget)
            .to(floorCenter, this.config.cameraAnimationDuration)
            .easing(this.getEasingFunction())

        cameraPositionTween.onUpdate(() => {
            this.cameraControls.object.position.copy(startPosition)
        })

        cameraTargetTween.onUpdate(() => {
            this.cameraControls.target.copy(startTarget)
            this.cameraControls.update()
        })

        cameraPositionTween.onComplete(() => {
            onComplete?.()
        })

        this.activeTweens.add(cameraPositionTween)
        this.activeTweens.add(cameraTargetTween)
        
        cameraPositionTween.start()
        cameraTargetTween.start()

        this.cameraAnimationTween = cameraPositionTween
    }

    /**
     * 恢复相机位置
     */
    private restoreCameraPosition(onComplete?: () => void): void {
        if (!this.cameraControls || !this.originalCameraPosition) {
            console.warn('⚠️ 无法恢复相机位置：相机控制器或原始位置未设置')
            onComplete?.()
            return
        }

        const startPosition = this.cameraControls.object.position.clone()
        const startTarget = this.cameraControls.target.clone()

        const cameraPositionTween = new TWEEN.Tween(startPosition)
            .to(this.originalCameraPosition, this.config.cameraAnimationDuration)
            .easing(this.getEasingFunction())

        const cameraTargetTween = new TWEEN.Tween(startTarget)
            .to(this.originalCameraTarget || new THREE.Vector3(0, 0, 0), this.config.cameraAnimationDuration)
            .easing(this.getEasingFunction())

        cameraPositionTween.onUpdate(() => {
            this.cameraControls.object.position.copy(startPosition)
        })

        cameraTargetTween.onUpdate(() => {
            this.cameraControls.target.copy(startTarget)
            this.cameraControls.update()
        })

        cameraPositionTween.onComplete(() => {
            onComplete?.()
        })

        this.activeTweens.add(cameraPositionTween)
        this.activeTweens.add(cameraTargetTween)
        
        cameraPositionTween.start()
        cameraTargetTween.start()
    }

    /**
     * 获取缓动函数
     * @param easingFunction 缓动函数名称
     * @returns 缓动函数 默认为线性
     */
    private getEasingFunction(): (t: number) => number {
        const easingMap: { [key: string]: (t: number) => number } = {
            'Linear.None': TWEEN.Easing.Linear.None,
            'Quadratic.In': TWEEN.Easing.Quadratic.In,
            'Quadratic.Out': TWEEN.Easing.Quadratic.Out,
            'Quadratic.InOut': TWEEN.Easing.Quadratic.InOut,
            'Cubic.In': TWEEN.Easing.Cubic.In,
            'Cubic.Out': TWEEN.Easing.Cubic.Out,
            'Cubic.InOut': TWEEN.Easing.Cubic.InOut,
            'Quartic.In': TWEEN.Easing.Quartic.In,
            'Quartic.Out': TWEEN.Easing.Quartic.Out,
            'Quartic.InOut': TWEEN.Easing.Quartic.InOut,
        }

        return easingMap[this.config.easingFunction] || TWEEN.Easing.Linear.None
    }

    // 用于存储延迟动画的计时器ID
    private delayedAnimationTimeouts: NodeJS.Timeout[] = []

    /**
     * 停止所有活动的动画
     */
    private stopAllAnimations(): void {
        // 停止所有TWEEN动画
        this.activeTweens.removeAll()
        
        // 停止相机动画
        if (this.cameraAnimationTween) {
            this.cameraAnimationTween.stop()
            this.cameraAnimationTween = null
        }

        // 清除所有延迟动画的定时器
        this.delayedAnimationTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId)
        })
        this.delayedAnimationTimeouts = []
    }

    /**
     * 获取当前状态
     */
    public getCurrentState(): FloorState {
        return this.currentState
    }

    /**
     * 获取当前聚焦的楼层
     */
    public getFocusedFloor(): number | null {
        return this.focusedFloor
    }

    /**
     * 检查指定楼层是否存在
     */
    public hasFloor(floorNumber: number): boolean {
        return this.floors.has(floorNumber)
    }

    /**
     * 获取所有楼层号
     */
    public getFloorNumbers(): number[] {
        return Array.from(this.floors.keys()).sort((a, b) => a - b)
    }

    /**
     * 切换楼层展开/收起状态
     * 如果当前是正常状态，则展开；如果是展开状态，则收起
     */
    public toggleFloorExpansion(): void {
        if (this.currentState === FloorState.NORMAL) {
            this.expandFloor()
        } else if (this.currentState === FloorState.EXPANDED) {
            this.collapseFloor()
        } else {
            console.warn('⚠️ 当前处于聚焦状态，请先取消聚焦再执行展开/收起操作')
        }
    }

    /**
     * 检查是否可以执行楼层操作
     * @returns 是否可以执行操作
     */
    public canPerformFloorOperation(): boolean {
        return this.floors.size > 0 && this.isStructureLinked()
    }

    /**
     * 获取动画进度信息（用于调试）
     */
    public getAnimationInfo(): {
        currentState: FloorState
        focusedFloor: number | null
        totalFloors: number
        activeTweensCount: number
        delayedTimeoutsCount: number
    } {
        return {
            currentState: this.currentState,
            focusedFloor: this.focusedFloor,
            totalFloors: this.floors.size,
            activeTweensCount: this.activeTweens.getAll().length,
            delayedTimeoutsCount: this.delayedAnimationTimeouts.length
        }
    }

    /**
     * 获取材质映射状态信息（用于调试）
     */
    public getMaterialMappingInfo(): {
        totalClonedMaterials: number
        floorMaterials: number
        roomMaterials: number
        equipmentMaterials: number
        materialsByType: { [key: string]: string[] }
    } {
        const materialsByType: { [key: string]: string[] } = {
            floor: [],
            room: [],
            equipment: []
        }

        let floorCount = 0
        let roomCount = 0
        let equipmentCount = 0

        this.materialsMap.forEach((material, key) => {
            const parts = key.split('_')
            if (parts.length >= 2) {
                const type = parts[0]
                switch (type) {
                    case 'floor':
                        floorCount++
                        materialsByType.floor.push(key)
                        break
                    case 'room':
                        roomCount++
                        materialsByType.room.push(key)
                        break
                    case 'equipment':
                        equipmentCount++
                        materialsByType.equipment.push(key)
                        break
                }
            }
        })

        return {
            totalClonedMaterials: this.materialsMap.size,
            floorMaterials: floorCount,
            roomMaterials: roomCount,
            equipmentMaterials: equipmentCount,
            materialsByType
        }
    }

    /**
     * 验证材质映射完整性（用于调试）
     */
    public validateMaterialMapping(): {
        isValid: boolean
        issues: string[]
        statistics: {
            orphanedClones: number
            missingOriginals: number
            invalidKeys: number
        }
    } {
        const issues: string[] = []
        let orphanedClones = 0
        let missingOriginals = 0
        let invalidKeys = 0

        this.materialsMap.forEach((clonedMaterial, key) => {
            // 检查键格式
            const parts = key.split('_')
            if (parts.length < 4) {
                invalidKeys++
                issues.push(`无效的键格式: ${key}`)
                return
            }

            // 检查是否有原始材质引用
            if (!clonedMaterial.userData.originalMaterial) {
                missingOriginals++
                issues.push(`缺少原始材质引用: ${key}`)
            }

            // 检查是否为孤立的克隆材质（没有被任何Mesh使用）
            let isInUse = false
            if (this.scene) {
                this.scene.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material]
                        if (materials.includes(clonedMaterial)) {
                            isInUse = true
                        }
                    }
                })
            }

            if (!isInUse) {
                orphanedClones++
                issues.push(`孤立的克隆材质: ${key}`)
            }
        })

        return {
            isValid: issues.length === 0,
            issues,
            statistics: {
                orphanedClones,
                missingOriginals,
                invalidKeys
            }
        }
    }

    /**
     * 关联设备模型到楼层
     * 根据命名规则自动识别和关联设备
     */
    private associateEquipmentToFloorsAndRooms(): void {
        this.allDevices.forEach((device) => {
            const info = device.userData.equipmentInfo
            if (!info) return

            // 关联到楼层
            const floor = this.floors.get(info.floorNumber)
            if (floor) {
                const exists = floor.associatedEquipment.some(eq => eq.equipment === device)
                if (!exists) {
                    floor.associatedEquipment.push(info)
                }
            }

            // 关联到房间（如果有房间代码）
            if (info.roomCode) {
                const room = this.rooms.get(info.roomCode)
                if (room) {
                    const exists = room.associatedEquipment.some(eq => eq.equipment === device)
                    if (!exists) {
                        room.associatedEquipment.push(info)
                    }
                }
            }
        })
    }

    /**
     * 解析所有设备列表
     * 根据命名规则自动识别设备
     */
    private parseAllEquipments(): void {
        if (!this.scene) return

        // 清空现有设备列表，避免重复
        this.allDevices = []

        this.scene.children.forEach((child) => {
            const modelName = this.getModelName(child)
            
            // 匹配设备命名规则: MAIN_BUILDING_1F_厨具 或 MAIN_BUILDING_1F_R101_厨具
            const equipmentPattern = /^MAIN_BUILDING_(\d+)F_(.+)$/i
            const match = modelName.match(equipmentPattern)
            
            if (match) {
                const floorNumber = parseInt(match[1], 10)
                const remaining = match[2]
                
                // 进一步解析房间代码和设备名称
                const roomPattern = /^([A-Z]\d+)_(.+)$/i
                const roomMatch = remaining.match(roomPattern)
                
                let roomCode = ''
                let equipmentName = remaining
                
                if (roomMatch) {
                    // 有房间代码的情况：MAIN_BUILDING_1F_R101_厨具
                    roomCode = roomMatch[1]
                    equipmentName = roomMatch[2]
                } else {
                    // 没有房间代码的情况：MAIN_BUILDING_1F_厨具
                    equipmentName = remaining
                }

                const equipmentInfo = {
                    equipment: child,
                    equipmentName: equipmentName,
                    roomCode: roomCode,
                    floorNumber: floorNumber
                }
                
                child.userData.equipmentInfo = equipmentInfo
                this.allDevices.push(child)
                
                console.log(`🔧 发现设备: ${equipmentName} (楼层:${floorNumber}F, 房间:${roomCode || '无'})`)
            }
        })
        
        console.log(`✅ 设备解析完成，共发现 ${this.allDevices.length} 个设备`)
    }

    /**
     * 获取楼层关联的设备列表
     * @param floorNumber 楼层号
     * @returns 设备对象数组
     */
    public getFloorEquipment(floorNumber: number): THREE.Object3D[] {
        const floor = this.floors.get(floorNumber)
        return floor ? floor.associatedEquipment.map(info => info.equipment) : []
    }

    /**
     * 获取房间关联的设备列表
     * @param roomCode 房间代码
     * @returns 设备对象数组
     */
    public getRoomEquipment(roomCode: string): THREE.Object3D[] {
        const room = this.rooms.get(roomCode)
        return room ? room.associatedEquipment.map(info => info.equipment) : []
    }

    /**
     * 手动关联设备到楼层
     * @param equipment 设备对象
     * @param floorNumber 楼层号
     * @returns 是否关联成功
     */
    public associateEquipmentToFloor(equipment: THREE.Object3D, floorNumber: number): boolean {
        const floor = this.floors.get(floorNumber)
        if (!floor) {
            console.warn(`⚠️ 楼层 ${floorNumber}F 不存在，无法关联设备`)
            return false
        }

        const exists = floor.associatedEquipment.some(info => info.equipment === equipment)
        if (!exists) {
            const equipmentInfo = {
                equipment: equipment,
                equipmentName: this.getModelName(equipment),
                roomCode: '',
                floorNumber: floorNumber
            }
            floor.associatedEquipment.push(equipmentInfo)
            console.log(`🔧 手动关联设备: ${this.getModelName(equipment)} → ${floorNumber}F`)
            return true
        }

        return false
    }

    /**
     * 移除楼层的设备关联
     * @param equipment 设备对象
     * @param floorNumber 楼层号
     * @returns 是否移除成功
     */
    public removeEquipmentFromFloor(equipment: THREE.Object3D, floorNumber: number): boolean {
        const floor = this.floors.get(floorNumber)
        if (!floor) {
            return false
        }

        const index = floor.associatedEquipment.findIndex(info => info.equipment === equipment)
        if (index > -1) {
            floor.associatedEquipment.splice(index, 1)
            console.log(`🔧 移除设备关联: ${this.getModelName(equipment)} ← ${floorNumber}F`)
            return true
        }

        return false
    }

    /**
     * 设置指定设备的透明度
     * @param equipment 设备对象
     * @param opacity 透明度值 (0-1)
     */
    public setEquipmentOpacityPublic(equipment: THREE.Object3D, opacity: number): void {
        this.setEquipmentOpacity(equipment, opacity)
        console.log(`🎨 设置设备透明度: ${this.getModelName(equipment)} → ${opacity}`)
    }

    /**
     * 恢复指定设备的原始透明度
     * @param equipment 设备对象
     */
    public restoreEquipmentOpacityPublic(equipment: THREE.Object3D): void {
        this.restoreObjectOpacity(equipment, 'equipment', equipment.uuid)
        console.log(`🎨 恢复设备透明度: ${this.getModelName(equipment)}`)
    }

    /**
     * 手动设置指定楼层的透明度
     * @param floorNumber 楼层号
     * @param opacity 透明度值 (0-1)
     */
    public setFloorOpacityPublic(floorNumber: number, opacity: number): void {
        const floor = this.floors.get(floorNumber)
        if (floor) {
            this.setFloorOpacity(floor, opacity)
            console.log(`🎨 设置楼层透明度: ${floorNumber}F → ${opacity}`)
        } else {
            console.warn(`⚠️ 楼层 ${floorNumber}F 不存在`)
        }
    }

    /**
     * 手动恢复指定楼层的原始透明度
     * @param floorNumber 楼层号
     */
    public restoreFloorOpacityPublic(floorNumber: number): void {
        const floor = this.floors.get(floorNumber)
        if (floor) {
            this.restoreFloorOpacity(floor)
            console.log(`🎨 恢复楼层透明度: ${floorNumber}F`)
        } else {
            console.warn(`⚠️ 楼层 ${floorNumber}F 不存在`)
        }
    }

    /**
     * 手动设置指定房间的透明度
     * @param roomCode 房间代码
     * @param opacity 透明度值 (0-1)
     */
    public setRoomOpacityPublic(roomCode: string, opacity: number): void {
        const roomObject = this.getRoomObject(roomCode)
        if (roomObject) {
            this.setRoomOpacity(roomObject, opacity)
            console.log(`🎨 设置房间透明度: ${roomCode} → ${opacity}`)
        } else {
            console.warn(`⚠️ 房间 ${roomCode} 不存在`)
        }
    }

    /**
     * 手动恢复指定房间的原始透明度
     * @param roomCode 房间代码
     */
    public restoreRoomOpacityPublic(roomCode: string): void {
        const roomObject = this.getRoomObject(roomCode)
        if (roomObject) {
            this.restoreRoomOpacity(roomObject)
            console.log(`🎨 恢复房间透明度: ${roomCode}`)
        } else {
            console.warn(`⚠️ 房间 ${roomCode} 不存在`)
        }
    }

    /**
     * 获取楼层和房间位置状态信息（用于调试）
     */
    public getFloorAndRoomPositionInfo(): {
        floorPositions: { [floorNumber: number]: {
            originalPosition: THREE.Vector3
            currentPosition: THREE.Vector3
            targetPosition: THREE.Vector3
            rooms: { [roomCode: string]: {
                originalPosition: THREE.Vector3
                currentPosition: THREE.Vector3
                targetPosition: THREE.Vector3
                hasOriginalY: boolean
            }}
        }}
        summary: {
            totalFloors: number
            totalRooms: number
            floorsWithPositionIssues: number[]
            roomsWithPositionIssues: string[]
        }
    } {
        const floorPositions: any = {}
        const floorsWithIssues: number[] = []
        const roomsWithIssues: string[] = []
        let totalRooms = 0

        this.floors.forEach((floor, floorNumber) => {
            const floorInfo: any = {
                originalPosition: floor.originalPosition.clone(),
                currentPosition: floor.group.position.clone(),
                targetPosition: floor.targetPosition.clone(),
                rooms: {}
            }

            // 检查楼层位置是否有问题
            const positionDiff = floor.group.position.distanceTo(floor.originalPosition)
            if (this.currentState === FloorState.NORMAL && positionDiff > 0.1) {
                floorsWithIssues.push(floorNumber)
            }

            // 检查房间位置
            floor.rooms.forEach(roomItem => {
                totalRooms++
                const room = roomItem.group
                const roomInfo = {
                    originalPosition: roomItem.originalPosition.clone(),
                    currentPosition: room.position.clone(),
                    targetPosition: roomItem.targetPosition.clone(),
                    hasOriginalY: room.userData.originalY !== undefined
                }

                // 检查房间位置是否有问题
                const roomPositionDiff = room.position.distanceTo(roomItem.originalPosition)
                if (this.currentState === FloorState.NORMAL && roomPositionDiff > 0.1) {
                    roomsWithIssues.push(`${floorNumber}F_${roomItem.roomNumber}`)
                }

                floorInfo.rooms[roomItem.roomNumber] = roomInfo
            })

            floorPositions[floorNumber] = floorInfo
        })

        return {
            floorPositions,
            summary: {
                totalFloors: this.floors.size,
                totalRooms,
                floorsWithPositionIssues: floorsWithIssues,
                roomsWithPositionIssues: roomsWithIssues
            }
        }
    }

    /**
     * 强制重置所有楼层和房间位置到原始状态（调试用）
     */
    public forceResetAllPositions(): void {
        console.log('🔧 强制重置所有楼层和房间位置到原始状态')
        
        this.floors.forEach((floor, floorNumber) => {
            // 重置楼层位置
            floor.group.position.copy(floor.originalPosition)
            console.log(`✅ 重置楼层 ${floorNumber}F 位置`)
            
            // 重置房间位置
            floor.rooms.forEach(roomItem => {
                roomItem.group.position.copy(roomItem.originalPosition)
                
                // 清理临时数据
                if (roomItem.group.userData.originalY !== undefined) {
                    delete roomItem.group.userData.originalY
                }
                
                console.log(`✅ 重置房间 ${roomItem.roomNumber} 位置`)
            })
            
            // 重置设备位置
            floor.associatedEquipment.forEach(equipmentInfo => {
                // 这里假设设备的原始位置保存在某个地方，如果没有则跳过
                if (equipmentInfo.equipment.userData.originalY !== undefined) {
                    delete equipmentInfo.equipment.userData.originalY
                }
            })
        })
        
        // 更新状态
        this.currentState = FloorState.NORMAL
        this.focusedFloor = null
        
        console.log('✅ 所有位置重置完成')
    }

    /**
     * 获取房间轮廓信息
     * @param roomCode 房间代码
     * @returns 房间轮廓信息，如果不存在返回null
     */
    public getRoomBounding(roomCode: string): {
        vertices: Array<{ x: number, y: number, z: number }>
        vertexCount: number
        center: { x: number, y: number, z: number }
        extractedAt: number
        meshName: string
    } | null {
        const roomObject = this.getRoomObject(roomCode)
        if (!roomObject || !roomObject.userData || !roomObject.userData.bounding) {
            return null
        }
        return roomObject.userData.bounding
    }

    /**
     * 获取所有房间的轮廓信息
     * @returns 房间轮廓信息的映射表
     */
    public getAllRoomBoundings(): Map<string, {
        vertices: Array<{ x: number, y: number, z: number }>
        vertexCount: number
        center: { x: number, y: number, z: number }
        extractedAt: number
        meshName: string
    }> {
        const boundings = new Map()
        
        this.rooms.forEach((room, roomCode) => {
            const bounding = this.getRoomBounding(roomCode)
            if (bounding) {
                boundings.set(roomCode, bounding)
            }
        })
        
        return boundings
    }

    /**
     * 重新提取指定房间的轮廓
     * @param roomCode 房间代码
     * @returns 是否提取成功
     */
    public reextractRoomBounding(roomCode: string): boolean {
        const roomObject = this.getRoomObject(roomCode)
        if (!roomObject) {
            console.warn(`⚠️ 房间 ${roomCode} 不存在`)
            return false
        }

        try {
            this.extractAndSaveRoomBounding(roomObject, roomCode)
            return true
        } catch (error) {
            console.error(`❌ 重新提取房间 ${roomCode} 轮廓失败:`, error)
            return false
        }
    }

    /**
     * 重新提取所有房间的轮廓
     * @returns 提取成功的房间数量
     */
    public reextractAllRoomBoundings(): number {
        let successCount = 0
        
        this.rooms.forEach((room, roomCode) => {
            try {
                this.extractAndSaveRoomBounding(room.group, roomCode)
                successCount++
            } catch (error) {
                console.error(`❌ 重新提取房间 ${roomCode} 轮廓失败:`, error)
            }
        })
        
        console.log(`✅ 重新提取完成，成功处理 ${successCount}/${this.rooms.size} 个房间`)
        return successCount
    }

    /**
     * 获取房间轮廓提取状态概览
     * @returns 轮廓提取状态信息
     */
    public getBoundingExtractionOverview(): {
        totalRooms: number
        extractedRooms: number
        missingBoundings: string[]
        averageVertexCount: number
        extractionDetails: Array<{
            roomCode: string
            hasBeenExtracted: boolean
            vertexCount: number
            extractedAt?: number
            meshName?: string
        }>
    } {
        const details: Array<{
            roomCode: string
            hasBeenExtracted: boolean
            vertexCount: number
            extractedAt?: number
            meshName?: string
        }> = []
        
        const missingBoundings: string[] = []
        let totalVertices = 0
        let extractedCount = 0
        
        this.rooms.forEach((room, roomCode) => {
            const bounding = this.getRoomBounding(roomCode)
            
            if (bounding) {
                details.push({
                    roomCode,
                    hasBeenExtracted: true,
                    vertexCount: bounding.vertexCount,
                    extractedAt: bounding.extractedAt,
                    meshName: bounding.meshName
                })
                totalVertices += bounding.vertexCount
                extractedCount++
            } else {
                details.push({
                    roomCode,
                    hasBeenExtracted: false,
                    vertexCount: 0
                })
                missingBoundings.push(roomCode)
            }
        })
        
        return {
            totalRooms: this.rooms.size,
            extractedRooms: extractedCount,
            missingBoundings,
            averageVertexCount: extractedCount > 0 ? Math.round(totalVertices / extractedCount) : 0,
            extractionDetails: details
        }
    }

    /**
     * 清理所有材质副本（在插件销毁时调用）
     */
    public dispose(): void {
        // 恢复所有楼层的材质
        this.floors.forEach((floor) => {
            this.restoreObjectOpacity(floor.group, 'floor', floor.floorNumber)
        })
        
        // 恢复所有房间的材质
        this.rooms.forEach((room) => {
            this.restoreObjectOpacity(room.group, 'room', room.roomNumber)
        })
        
        // 恢复所有设备的材质
        this.allDevices.forEach((device) => {
            this.restoreObjectOpacity(device, 'equipment', device.uuid)
        })
        
        // 清理任何遗留的材质映射
        this.materialsMap.forEach((clonedMaterial) => {
            if (clonedMaterial.userData.isClonedByPlugin) {
                clonedMaterial.dispose()
            }
        })
        this.materialsMap.clear()
        
        // 停止所有动画
        this.stopAllAnimations()
        
        console.log('🧹 建筑控制插件已清理')
    }
}

/**
 * 
 * 
 * 
 * 
 * 
 * function getTopFaceVertices(cube) {
  const geometry = cube.geometry;
  const verticesArray = geometry.attributes.position.array;
  
  // 筛选Y值最大的顶点
  const maxY = Math.max(...Array.from({ length: verticesArray.length / 3 }, (_, i) => verticesArray[i * 3 + 1]));
  const topVertices = [];
  for (let i = 0; i < verticesArray.length; i += 3) {
    if (Math.abs(verticesArray[i + 1] - maxY) < 0.001) {
      topVertices.push(new THREE.Vector3(
        verticesArray[i], 
        verticesArray[i + 1], 
        verticesArray[i + 2]
      ));
    }
  }

  // 转换到世界坐标
  const worldVertices = topVertices.map(v => v.applyMatrix4(cube.matrixWorld).toArray());
  
  // 顶点排序（顺时针）
  const center = new THREE.Vector3();
  worldVertices.forEach(v => center.add(new THREE.Vector3(...v)));
  center.divideScalar(4);
  
  worldVertices.sort((a, b) => {
    return Math.atan2(a[2] - center.z, a[0] - center.x) 
         - Math.atan2(b[2] - center.z, b[0] - center.x);
  });

  return worldVertices; // 返回轮廓顶点数组
}
 */