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
    group: THREE.Group          // 楼层组对象
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
    group: THREE.Group          // 房间组对象
    roomNumber: string          // 房间号
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

    // 默认配置
    private config: FloorControlConfig = {
        expandDistance: 10,
        animationDuration: 1000,
        focusOpacity: 1.0,
        unfocusOpacity: 0.2,
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
    private floorMaterials: Map<number, Map<THREE.Material, THREE.Material>> = new Map()

    // 相机管理
    private cameraControls: any = null
    private originalCameraPosition: THREE.Vector3 | null = null
    private originalCameraTarget: THREE.Vector3 | null = null
    private cameraAnimationTween: TWEEN.Tween<any> | null = null
    
    // 调试模式
    private debugMode: boolean = false

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
                    console.log(`🎭 发现外立面: ${modelName}`)
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
        const floor = this.floors.get(floorNumber)!
        floor.rooms.push({
            group: roomObject as THREE.Group,
            roomNumber: roomInfo.roomCode,
            originalPosition: roomObject.position.clone(),
            targetPosition: roomObject.position.clone(),
            isVisible: true,
            opacity: 1.0,
            associatedEquipment: [], // 后续通过设备关联功能填充
        })

        console.log(`🏠 发现房间: ${floorNumber}F-${roomInfo.roomCode}-${this.getModelName(roomObject)}`)
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

    // 建筑结构管理属性
    private facades: THREE.Object3D[] = []          // 外立面对象数组
    private rooms: Map<string, RoomItem> = new Map() // 房间索引 roomCode -> Roomitem 
    private parseResult: ReturnType<typeof this.parseBuildingModel> | null = null

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
            this.rooms.clear()

            // 链接楼层和房间
            this.linkFloors(parseResult)
            
            // 链接外立面
            this.linkFacades(parseResult)
            
            // 链接房间索引
            this.linkRooms(parseResult)

            // 关联设备到楼层和房间
            this.associateEquipmentToFloorsAndRooms()

            console.log('✅ 建筑结构链接完成', {
                楼层数: this.floors.size,
                房间数: this.rooms.size / 2, // 除以2因为每个房间有两个键
                外立面数: this.facades.length,
                设备数: this.allDevices.length
            })

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
                rooms: this.createRoomItems(floorData.rooms) // 创建房间管理项
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
    }>): RoomItem[] {
        return roomsData.map(roomData => ({
            group: roomData.roomObject as THREE.Group, // 直接引用原始对象
            roomNumber: roomData.roomCode,
            originalPosition: roomData.roomObject.position.clone(),
            targetPosition: roomData.roomObject.position.clone(),
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
        parseResult.floors.forEach((floorData) => {
            floorData.rooms.forEach(roomData => {
                // 创建房间管理项
                const roomItem: RoomItem = {
                    group: roomData.roomObject as THREE.Group,
                    roomNumber: roomData.roomCode,
                    originalPosition: roomData.roomObject.position.clone(),
                    targetPosition: roomData.roomObject.position.clone(),
                    isVisible: true,
                    opacity: 1.0,
                    associatedEquipment: []
                }
                
                // 使用房间代码作为键
                this.rooms.set(roomData.roomCode, roomItem)
                
                // 也可以用完整楼层+房间代码作为键
                const fullRoomKey = `${floorData.floorNumber}F_${roomData.roomCode}`
                this.rooms.set(fullRoomKey, roomItem)
            })
        })
        
        console.log(`🔗 房间索引创建完成: ${this.rooms.size / 2}个房间`) // 除以2因为每个房间有两个键
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
        this.currentState = FloorState.NORMAL
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
        const floorNumbers = Array.from(this.floors.keys()).sort((a, b) => a - b)
        const expandDistance = this.config.expandDistance

        floorNumbers.forEach((floorNumber, index) => {
            const floor = this.floors.get(floorNumber)!
            
            // 计算垂直偏移：以最底层为基准，向上依次展开
            const verticalOffset = index * expandDistance
            
            floor.targetPosition = floor.originalPosition.clone()
            floor.targetPosition.y += verticalOffset
        })
    }

    /**
     * 执行展开动画
     * 使用渐进式动画，楼层依次展开，创建视觉层次感
     */
    private executeExpandAnimation(onComplete?: () => void): void {
        const floorNumbers = Array.from(this.floors.keys()).sort((a, b) => a - b)
        
        if (floorNumbers.length === 0) {
            console.warn('⚠️ 没有楼层可以展开')
            onComplete?.()
            return
        }

        // 创建渐进式动画序列
        const animationPromises: Promise<void>[] = []

        floorNumbers.forEach((floorNumber, index) => {
            const floor = this.floors.get(floorNumber)!
            const delay = index * 200 // 每个楼层延迟200ms开始动画，创建层次感

            const promise = new Promise<void>((resolve) => {
                // 延迟执行动画
                const timeoutId = setTimeout(() => {
                    const startPosition = floor.group.position.clone()
                    const endPosition = floor.targetPosition.clone()

                    // 创建位置动画
                    const positionTween = new TWEEN.Tween(startPosition)
                        .to(endPosition, this.config.animationDuration)
                        .easing(this.getEasingFunction())
                        .onUpdate(() => {
                            const deltaY = startPosition.y - floor.originalPosition.y
                            
                            // 移动楼层
                            floor.group.position.copy(startPosition)
                            
                            // 同时移动关联的设备
                            floor.associatedEquipment.forEach(equipmentInfo => {
                                const equipment = equipmentInfo.equipment
                                if (equipment.userData.originalY === undefined) {
                                    equipment.userData.originalY = equipment.position.y
                                }
                                equipment.position.y = equipment.userData.originalY + deltaY
                            })
                        })
                        .onComplete(() => {
                            console.log(`✅ 楼层 ${floorNumber}F 展开完成`)
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
                            
                            // 恢复关联设备位置
                            floor.associatedEquipment.forEach(equipmentInfo => {
                                const equipment = equipmentInfo.equipment
                                if (equipment.userData.originalY !== undefined) {
                                    equipment.position.y = equipment.userData.originalY + deltaY
                                }
                            })
                        })
                        .onComplete(() => {
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
            const targetOpacity = floorNumber === focusedFloorNumber 
                ? this.config.focusOpacity 
                : this.config.unfocusOpacity

            this.setFloorOpacity(floor, targetOpacity)
        })
    }

    /**
     * 设置楼层透明度
     */
    private setFloorOpacity(floor: FloorItem, opacity: number): void {
        floor.opacity = opacity
        
        // 遍历楼层的所有材质并设置透明度
        floor.group.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material]
                
                materials.forEach((material) => {
                    if (material instanceof THREE.MeshBasicMaterial || 
                        material instanceof THREE.MeshLambertMaterial ||
                        material instanceof THREE.MeshPhongMaterial ||
                        material instanceof THREE.MeshStandardMaterial ||
                        material instanceof THREE.MeshPhysicalMaterial) {
                        
                        // 保存原始透明度设置
                        if (!this.floorMaterials.has(floor.floorNumber)) {
                            this.floorMaterials.set(floor.floorNumber, new Map())
                        }
                        
                        const floorMaterialMap = this.floorMaterials.get(floor.floorNumber)!
                        if (!floorMaterialMap.has(material)) {
                            floorMaterialMap.set(material, material.clone())
                        }

                        // 设置透明度
                        material.transparent = opacity < 1.0
                        material.opacity = opacity
                        material.needsUpdate = true
                    }
                })
            }
        })
    }

    /**
     * 恢复所有楼层透明度
     */
    private restoreAllFloorOpacity(): void {
        this.floors.forEach((floor) => {
            this.setFloorOpacity(floor, 1.0)
        })
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
}