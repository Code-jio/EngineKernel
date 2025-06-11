// 这个插件的功能主要有：
// 1. 拆分可互动楼层，并提供拆分动画（主要表现为：各个楼层在垂直方向上一层一层的展开）
// 2. 恢复楼层原有状态（将已拆分的楼层恢复到原有状态），并恢复建筑外立面的显示
// 3. 切换至指定楼层，并提供切换动画，切换完成时，其他楼层设置为半透明
// 

import { THREE, BasePlugin } from "../basePlugin"
import * as TWEEN from '@tweenjs/tween.js'

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
    associatedEquipment: THREE.Object3D[]  // 关联的设备模型数组
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
    private floorsGroup: THREE.Group | null = null
    private currentBuildingModel: THREE.Group | null = null
    private activeTweens: TWEEN.Group = new TWEEN.Group()
    private focusedFloor: number | null = null
    
    // 外立面状态管理（参考mousePickPlugin的实现）
    private hiddenFacades: THREE.Object3D[] = []
    
    // 设备模型管理
    private equipmentModels: THREE.Object3D[] = []
    
    // 默认配置
    private config: FloorControlConfig = {
        expandDistance: 50,
        animationDuration: 1000,
        focusOpacity: 1.0,
        unfocusOpacity: 0.3,
        easingFunction: 'Quadratic.InOut',
        showFacade: true,
        autoHideFacade: true
    }
    
    private events: FloorControlEvents = {}
    
    constructor(params: any = {}) {
        super(params)
        this.updateConfig(params.floorControlConfig || {})
        this.events = params.events || {}
    }
    
    public async init(coreInterface: any): Promise<void> {
        console.log(`🏗️ ${this.name} v${this.version} 已初始化`)
    }
    
    /**
     * 更新配置
     */
    public updateConfig(newConfig: Partial<FloorControlConfig>): void {
        this.config = { ...this.config, ...newConfig }
    }
    
    /**
     * 设置建筑模型
     */
    public setBuildingModel(model: THREE.Group): boolean {
        if (!model.userData.isBuildingModel) {
            console.warn('⚠️ 传入的模型不是建筑模型')
            return false
        }
        
        this.currentBuildingModel = model
        this.floors.clear()
        this.facadeGroup = null
        this.floorsGroup = null
        // 重置外立面状态
        this.hiddenFacades = []
        
        // 查找外立面组和楼层组
        this.findBuildingGroups(model)
        
        if (!this.floorsGroup) {
            console.warn('⚠️ 未找到楼层组')
            console.log('🔍 调试信息 - 建筑模型结构:')
            console.log('建筑模型名称:', model.name)
            console.log('建筑模型userData:', model.userData)
            
            // 打印所有子对象的详细信息
            const childInfo: any[] = []
            model.children.forEach((child, index) => {
                childInfo.push({
                    index: index,
                    name: child.name,
                    type: child.type,
                    userData: child.userData,
                    childrenCount: child.children ? child.children.length : 0
                })
            })
            console.log('所有子对象详情:', childInfo)
            
            // 尝试智能查找可能的楼层组
            this.attemptSmartFloorGroupDetection(model)
        }
        
        // 初始化楼层数据
        this.initializeFloors()
        
        console.log(`🏗️ 建筑模型已设置，包含 ${this.floors.size} 个楼层`)
        return true
    }
    
    /**
     * 查找建筑的各个组件组
     */
    private findBuildingGroups(model: THREE.Group): void {
        // 外立面和楼层组的可能命名关键词
        const facadeKeywords = ['facade', 'mask', 'exterior', 'wall', 'curtain', '外立面', '立面', '幕墙']
        const floorKeywords = ['floor', 'level', 'story', 'storey', '楼层', '层', '楼']
        
        model.children.forEach(child => {
            const name = child.name.toLowerCase()
            
            // 查找外立面组
            if (!this.facadeGroup && facadeKeywords.some(keyword => name.includes(keyword))) {
                this.facadeGroup = child as THREE.Group
                console.log(`🎯 找到外立面组: ${child.name}`)
            }
            
            // 查找楼层组
            if (!this.floorsGroup && floorKeywords.some(keyword => name.includes(keyword))) {
                this.floorsGroup = child as THREE.Group
                console.log(`🎯 找到楼层组: ${child.name}`)
            }
        })
    }
    
    /**
     * 尝试智能检测楼层组
     */
    private attemptSmartFloorGroupDetection(model: THREE.Group): void {
        console.log('🔍 尝试智能检测楼层组...')
        
        // 方法1: 查找包含多个子对象的Group，可能是楼层组
        const candidateGroups: THREE.Group[] = []
        model.children.forEach(child => {
            if (child.type === 'Group' && child.children.length > 0) {
                candidateGroups.push(child as THREE.Group)
            }
        })
        
        console.log(`找到 ${candidateGroups.length} 个候选楼层组:`, candidateGroups.map(g => g.name))
        
        // 方法2: 如果只有一个主要的Group，就使用它
        if (candidateGroups.length === 1) {
            this.floorsGroup = candidateGroups[0]
            console.log(`🎯 自动设置楼层组: ${this.floorsGroup.name}`)
        } else if (candidateGroups.length > 1) {
            // 方法3: 选择子对象最多的Group
            const largestGroup = candidateGroups.reduce((max, current) => 
                current.children.length > max.children.length ? current : max
            )
            this.floorsGroup = largestGroup
            console.log(`🎯 选择最大的组作为楼层组: ${this.floorsGroup.name} (${this.floorsGroup.children.length} 个子对象)`)
        }
        
        // 方法4: 如果还没找到，尝试将整个建筑模型作为楼层组
        if (!this.floorsGroup && model.children.length > 0) {
            console.log('🎯 将整个建筑模型作为楼层组')
            this.floorsGroup = model
        }
    }
    
    /**
     * 初始化楼层数据
     */
    private initializeFloors(): void {
        if (!this.floorsGroup) return
        
        // 方法1: 查找明确标记的楼层组
        this.floorsGroup.children.forEach(child => {
            const floorGroup = child as THREE.Group
            if (floorGroup.userData && floorGroup.userData.isFloorGroup) {
                const floorNumber = floorGroup.userData.floorNumber
                const originalPosition = floorGroup.position.clone()
                
                const floorItem: FloorItem = {
                    group: floorGroup,
                    floorNumber: floorNumber,
                    originalPosition: originalPosition,
                    targetPosition: originalPosition.clone(),
                    isVisible: true,
                    opacity: 1.0,
                    nodeCount: this.countFloorNodes(floorGroup),
                    associatedEquipment: []
                }
                
                this.floors.set(floorNumber, floorItem)
                console.log(`🎯 找到标记楼层: ${floorNumber}楼 (${floorGroup.name})`)
            }
        })
        
        // 方法2: 如果没有找到明确标记的楼层，尝试智能创建楼层
        if (this.floors.size === 0) {
            console.log('🔍 未找到明确标记的楼层，尝试智能创建楼层...')
            this.createSmartFloors()
        }
        
        console.log(`🏗️ 已初始化 ${this.floors.size} 个楼层:`, Array.from(this.floors.keys()).sort((a, b) => a - b))
        
        // 自动关联设备模型
        this.autoAssociateEquipment()
    }
    
    /**
     * 自动关联设备模型到对应楼层
     */
    private autoAssociateEquipment(): void {
        if (!this.currentBuildingModel) return
        
        // 查找设备模型
        this.findEquipmentModels()
        
        if (this.equipmentModels.length === 0) {
            console.log('🔍 未找到设备模型')
            return
        }
        
        console.log(`🔧 找到 ${this.equipmentModels.length} 个设备模型，开始关联到楼层...`)
        
        // 为每个设备模型分配到最近的楼层
        this.equipmentModels.forEach(equipment => {
            const closestFloor = this.findClosestFloor(equipment)
            if (closestFloor) {
                closestFloor.associatedEquipment.push(equipment)
                console.log(`🔗 设备 "${equipment.name}" 关联到 ${closestFloor.floorNumber}楼`)
            }
        })
        
        // 打印关联结果
        this.floors.forEach((floor, floorNumber) => {
            if (floor.associatedEquipment.length > 0) {
                console.log(`🏗️ ${floorNumber}楼关联了 ${floor.associatedEquipment.length} 个设备:`, 
                    floor.associatedEquipment.map(eq => eq.name))
            }
        })
    }
    
    /**
     * 查找设备模型
     */
    private findEquipmentModels(): void {
        this.equipmentModels = []
        
        // 设备模型的可能关键词
        const equipmentKeywords = [
            'equipment', 'device', 'machine', 'facility', 'apparatus',
            '设备', '装置', '机器', '器械', '器材', '设施',
            'hvac', 'air', 'conditioning', 'ventilation', '空调',
            'elevator', 'lift', '电梯', '升降机',
            'pump', 'fan', 'motor', '泵', '风机', '马达',
            'pipe', 'duct', '管道', '风管',
            'cabinet', 'panel', 'box', '柜', '箱', '盘'
        ]
        
        // 在建筑模型的父容器中查找设备模型
        const buildingParent = this.currentBuildingModel!.parent
        if (buildingParent) {
            buildingParent.traverse((child) => {
                // 排除建筑模型本身
                if (child === this.currentBuildingModel) return
                
                const name = child.name.toLowerCase()
                const userData = child.userData || {}
                
                // 检查是否是设备模型
                if (userData.isEquipmentModel || 
                    equipmentKeywords.some(keyword => name.includes(keyword))) {
                    this.equipmentModels.push(child)
                    console.log(`🔧 找到设备模型: ${child.name} (${child.type})`)
                }
            })
        }
        
        // 如果在父容器中没找到，在同级节点中查找
        if (this.equipmentModels.length === 0 && this.currentBuildingModel!.parent) {
            this.currentBuildingModel!.parent.children.forEach(sibling => {
                if (sibling === this.currentBuildingModel) return
                
                const name = sibling.name.toLowerCase()
                const userData = sibling.userData || {}
                
                if (userData.isEquipmentModel || 
                    equipmentKeywords.some(keyword => name.includes(keyword))) {
                    this.equipmentModels.push(sibling)
                    console.log(`🔧 找到同级设备模型: ${sibling.name} (${sibling.type})`)
                }
            })
        }
    }
    
    /**
     * 找到距离设备最近的楼层
     */
    private findClosestFloor(equipment: THREE.Object3D): FloorItem | null {
        if (this.floors.size === 0) return null
        
        const equipmentWorldPos = new THREE.Vector3()
        equipment.getWorldPosition(equipmentWorldPos)
        
        let closestFloor: FloorItem | null = null
        let minDistance = Infinity
        
        this.floors.forEach(floor => {
            const floorWorldPos = new THREE.Vector3()
            floor.group.getWorldPosition(floorWorldPos)
            
            // 主要比较Y坐标（高度），因为设备通常是按楼层分布
            const distance = Math.abs(equipmentWorldPos.y - floorWorldPos.y)
            
            if (distance < minDistance) {
                minDistance = distance
                closestFloor = floor
            }
        })
        
        return closestFloor
    }
    
    /**
     * 智能创建楼层数据
     */
    private createSmartFloors(): void {
        if (!this.floorsGroup) return
        
        // 收集所有可能的楼层对象
        const potentialFloors: { object: THREE.Object3D, y: number, name: string }[] = []
        
        this.floorsGroup.children.forEach((child, index) => {
            if (child.type === 'Group' || child.type === 'Mesh') {
                const worldPos = new THREE.Vector3()
                child.getWorldPosition(worldPos)
                
                potentialFloors.push({
                    object: child,
                    y: worldPos.y,
                    name: child.name || `Floor_${index}`
                })
            }
        })
        
        // 按Y坐标排序（从低到高）
        potentialFloors.sort((a, b) => a.y - b.y)
        
        console.log('🔍 找到潜在楼层对象:', potentialFloors.map(f => `${f.name} (Y: ${f.y.toFixed(2)})`))
        
        // 创建楼层数据
        potentialFloors.forEach((floorData, index) => {
            const floorNumber = index + 1 // 从1楼开始
            const originalPosition = floorData.object.position.clone()
            
            const floorItem: FloorItem = {
                group: floorData.object.type === 'Group' ? floorData.object as THREE.Group : this.wrapObjectInGroup(floorData.object),
                floorNumber: floorNumber,
                originalPosition: originalPosition,
                targetPosition: originalPosition.clone(),
                isVisible: true,
                opacity: 1.0,
                nodeCount: this.countFloorNodes(floorData.object),
                associatedEquipment: []
            }
            
            this.floors.set(floorNumber, floorItem)
            console.log(`🎯 创建智能楼层: ${floorNumber}楼 (${floorData.name}) - 位置: (${originalPosition.x.toFixed(2)}, ${originalPosition.y.toFixed(2)}, ${originalPosition.z.toFixed(2)}) - 世界Y: ${floorData.y.toFixed(2)}`)
        })
        
        // 如果仍然没有楼层，创建一个默认楼层
        if (this.floors.size === 0 && this.floorsGroup.children.length === 0) {
            console.log('🎯 创建默认楼层（整个建筑作为一层）')
            const floorItem: FloorItem = {
                group: this.floorsGroup,
                floorNumber: 1,
                originalPosition: this.floorsGroup.position.clone(),
                targetPosition: this.floorsGroup.position.clone(),
                isVisible: true,
                opacity: 1.0,
                nodeCount: this.countFloorNodes(this.floorsGroup),
                associatedEquipment: []
            }
            this.floors.set(1, floorItem)
        }
    }
    
    /**
     * 将对象包装成Group
     */
    private wrapObjectInGroup(object: THREE.Object3D): THREE.Group {
        const group = new THREE.Group()
        group.name = `${object.name}_wrapper`
        group.position.copy(object.position)
        group.rotation.copy(object.rotation)
        group.scale.copy(object.scale)
        
        // 将原始对象重置位置然后添加到组中
        const originalParent = object.parent
        if (originalParent) {
            originalParent.remove(object)
        }
        object.position.set(0, 0, 0)
        object.rotation.set(0, 0, 0)
        object.scale.set(1, 1, 1)
        group.add(object)
        
        // 将组添加回原始父对象
        if (originalParent) {
            originalParent.add(group)
        }
        
        return group
    }
    
    /**
     * 计算楼层节点数量
     */
    private countFloorNodes(object: THREE.Object3D | THREE.Group): number {
        let count = 0
        object.traverse(() => count++)
        return count - 1 // 减去object自身
    }
    
    /**
     * 展开所有楼层(一个动画：所有楼层向上进行位移，一楼保持不动)
     */
    public expandFloors(): Promise<void> {
        if (this.currentState === FloorState.EXPANDED) {
            console.log('🏗️ 楼层已经是展开状态')
            return Promise.resolve()
        }
        
        // 检查是否有楼层可以展开
        if (this.floors.size === 0) {
            console.warn('⚠️ 没有可展开的楼层')
            return Promise.resolve()
        }
        
        if (this.floors.size === 1) {
            console.log('🏗️ 只有一个楼层，无需展开')
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = FloorState.EXPANDED
            this.events.onExpandStart?.()
            
            // 自动隐藏外立面
            if (this.config.autoHideFacade && this.facadeGroup) {
                this.setFacadeVisibility(false)
            }
            
            const floorNumbers = Array.from(this.floors.keys()).sort((a, b) => a - b)
            const animations: Promise<void>[] = []
            const lowestFloorNumber = floorNumbers[0] // 最低楼层（一楼）
            
            // 获取最低楼层的原始Y坐标作为基准
            const lowestFloor = this.floors.get(lowestFloorNumber)!
            const baseY = lowestFloor.originalPosition.y
            
            console.log(`🏗️ 开始展开楼层，最低楼层: ${lowestFloorNumber}楼，基准Y坐标: ${baseY.toFixed(2)}`)
            
            floorNumbers.forEach((floorNumber, index) => {
                const floor = this.floors.get(floorNumber)!
                
                // 计算相对于最低楼层的楼层差
                const floorOffset = floorNumber - lowestFloorNumber
                
                // 基于最低楼层的Y坐标和统一间距来计算目标位置
                // 这样确保所有楼层之间的距离都是 expandDistance
                const targetY = baseY + (floorOffset * this.config.expandDistance)
                
                floor.targetPosition.set(
                    floor.originalPosition.x,
                    targetY,
                    floor.originalPosition.z
                )
                
                console.log(`🏗️ ${floorNumber}楼 - 楼层偏移: ${floorOffset}, 目标Y: ${targetY.toFixed(2)} (原始Y: ${floor.originalPosition.y.toFixed(2)}, 间距: ${this.config.expandDistance})`)
                
                // 同时移动楼层和关联的设备
                animations.push(this.animateFloorPosition(floor))
                animations.push(this.animateEquipmentWithFloor(floor))
            })
            
            Promise.all(animations).then(() => {
                this.events.onExpandComplete?.()
                console.log('🏗️ 楼层展开动画完成')
                resolve()
            })
        })
    }
    
    /**
     * 收回楼层到原位置
     */
    public collapseFloors(): Promise<void> {
        if (this.currentState === FloorState.NORMAL) {
            console.log('🏗️ 楼层已经是正常状态')
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = FloorState.NORMAL
            this.focusedFloor = null
            this.events.onCollapseStart?.()
            
            // 恢复外立面显示
            if (this.facadeGroup) {
                this.setFacadeVisibility(this.config.showFacade)
            }
            
            const animations: Promise<void>[] = []
            
            this.floors.forEach(floor => {
                floor.targetPosition.copy(floor.originalPosition)
                floor.opacity = 1.0
                animations.push(this.animateFloorPosition(floor))
                animations.push(this.animateFloorOpacity(floor, 1.0))
                animations.push(this.animateEquipmentWithFloor(floor))
            })
            
            Promise.all(animations).then(() => {
                this.events.onCollapseComplete?.()
                resolve()
            })
        })
    }
    
    /**
     * 聚焦到指定楼层
     */
    public focusOnFloor(floorNumber: number): Promise<void> {
        const targetFloor = this.floors.get(floorNumber)
        if (!targetFloor) {
            console.warn(`⚠️ 未找到 ${floorNumber} 楼`)
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = FloorState.FOCUSED
            this.focusedFloor = floorNumber
            this.events.onFloorFocus?.(floorNumber)
            
            // 隐藏外立面
            if (this.facadeGroup) {
                this.setFacadeVisibility(false)
            }
            
            const animations: Promise<void>[] = []
            
            this.floors.forEach(floor => {
                if (floor.floorNumber === floorNumber) {
                    // 聚焦楼层：完全不透明
                    floor.opacity = this.config.focusOpacity
                    animations.push(this.animateFloorOpacity(floor, this.config.focusOpacity))
                } else {
                    // 其他楼层：半透明
                    floor.opacity = this.config.unfocusOpacity
                    animations.push(this.animateFloorOpacity(floor, this.config.unfocusOpacity))
                }
            })
            
            Promise.all(animations).then(() => {
                resolve()
            })
        })
    }
    
    /**
     * 显示所有楼层（取消聚焦）
     */
    public showAllFloors(): Promise<void> {
        if (this.currentState !== FloorState.FOCUSED) {
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = this.currentState === FloorState.FOCUSED ? FloorState.EXPANDED : FloorState.NORMAL
            this.focusedFloor = null
            this.events.onFloorUnfocus?.()
            
            const animations: Promise<void>[] = []
            
            this.floors.forEach(floor => {
                floor.opacity = 1.0
                animations.push(this.animateFloorOpacity(floor, 1.0))
            })
            
            Promise.all(animations).then(() => {
                resolve()
            })
        })
    }
    
    /**
     * 设置楼层透明度
     */
    public setFloorOpacity(floorNumber: number, opacity: number): void {
        const floor = this.floors.get(floorNumber)
        if (!floor) return
        
        floor.opacity = opacity
        this.applyFloorOpacity(floor, opacity)
    }
    
    /**
     * 查找建筑的外立面对象（参考mousePickPlugin的实现）
     */
    private findBuildingFacades(buildingRoot: THREE.Object3D): THREE.Object3D[] {
        const facades: THREE.Object3D[] = []
        
        // 外立面关键词（包含ResourceReaderPlugin中使用的MASK关键字）
        const facadeKeywords = [
            'mask', 'masks', // ResourceReaderPlugin中使用的外立面标识
            'facade', 'facades', '外立面', '立面',
            'exterior', 'wall', 'walls', 'curtain', '幕墙', '外墙',
            'cladding', 'skin', 'envelope', '外包围', '建筑表皮',
            'outer', 'outside', 'external',
            'facadegroup', 'facade_group' // 可能的组名称
        ]
        
        buildingRoot.traverse((child) => {
            const name = child.name.toLowerCase()
            
            // 1. 查找外立面组（可能是由ResourceReaderPlugin创建的）
            if (child.type === 'Group' && facadeKeywords.some(keyword => name.includes(keyword))) {
                facades.push(child)
                console.log(`🎯 找到外立面组: ${child.name} (${child.type})`)
                return // 找到外立面组，不需要继续遍历其子节点
            }
            
            // 2. 查找单独的外立面网格对象
            if ((child.type === 'Mesh' || child.type === 'SkinnedMesh') && 
                facadeKeywords.some(keyword => name.includes(keyword))) {
                facades.push(child)
                console.log(`🎯 找到外立面网格: ${child.name} (${child.type})`)
            }
        })
        
        console.log(`🔍 外立面查找完成，共找到 ${facades.length} 个外立面对象`)
        return facades
    }
    
    /**
     * 隐藏建筑外立面（参考mousePickPlugin的实现）
     */
    private hideBuildingFacades(facades: THREE.Object3D[]): void {
        facades.forEach(facade => {
            facade.visible = false
            this.hiddenFacades.push(facade)
        })
        console.log(`🙈 已隐藏 ${facades.length} 个外立面对象`)
    }
    
    /**
     * 显示建筑外立面（参考mousePickPlugin的实现）
     */
    private showBuildingFacades(): void {
        this.hiddenFacades.forEach(facade => {
            facade.visible = true
        })
        console.log(`👁️ 已显示 ${this.hiddenFacades.length} 个外立面对象`)
        this.hiddenFacades = []
    }
    
    /**
     * 设置外立面可见性
     */
    public setFacadeVisibility(visible: boolean): void {
        if (!this.currentBuildingModel) {
            console.warn('⚠️ 没有设置建筑模型，无法控制外立面显隐')
            return
        }
        
        if (visible) {
            // 显示外立面
            if (this.hiddenFacades.length > 0) {
                this.showBuildingFacades()
            }
        } else {
            // 隐藏外立面
            if (this.hiddenFacades.length === 0) {
                // 如果还没有隐藏的外立面，先查找并隐藏
                const facades = this.findBuildingFacades(this.currentBuildingModel)
                if (facades.length > 0) {
                    this.hideBuildingFacades(facades)
                } else {
                    console.warn('⚠️ 未找到建筑外立面对象')
                    console.log('🔍 调试信息 - 建筑根对象结构:')
                    console.log('建筑根对象名称:', this.currentBuildingModel.name)
                    console.log('建筑根对象userData:', this.currentBuildingModel.userData)
                    
                    // 打印所有子对象的名称用于调试
                    const childNames: string[] = []
                    this.currentBuildingModel.traverse((child) => {
                        if (child !== this.currentBuildingModel) {
                            childNames.push(`${child.name} (${child.type})`)
                        }
                    })
                    console.log('所有子对象:', childNames)
                }
            }
        }
    }
    
    /**
     * 获取外立面是否可见
     */
    public isFacadeVisible(): boolean {
        return this.hiddenFacades.length === 0
    }
    
    /**
     * 切换外立面显隐状态
     */
    public toggleFacadeVisibility(): void {
        this.setFacadeVisibility(!this.isFacadeVisible())
    }
    
    /**
     * 动画化关联设备与楼层的同步移动
     */
    private animateEquipmentWithFloor(floor: FloorItem): Promise<void> {
        if (floor.associatedEquipment.length === 0) {
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            const animations: Promise<void>[] = []
            
            floor.associatedEquipment.forEach(equipment => {
                // 计算设备相对于楼层的偏移量
                const floorCurrentPos = floor.group.position.clone()
                const floorTargetPos = floor.targetPosition.clone()
                const equipmentCurrentPos = equipment.position.clone()
                
                // 设备目标位置 = 当前位置 + (楼层目标位置 - 楼层当前位置)
                const offset = floorTargetPos.clone().sub(floorCurrentPos)
                const equipmentTargetPos = equipmentCurrentPos.clone().add(offset)
                
                console.log(`🔧 设备 "${equipment.name}" 跟随 ${floor.floorNumber}楼移动: Y ${equipmentCurrentPos.y.toFixed(2)} → ${equipmentTargetPos.y.toFixed(2)}`)
                
                // 创建设备动画
                const equipmentAnimation = new Promise<void>((equipResolve) => {
                    const currentPos = equipment.position.clone()
                    
                    const tween = new TWEEN.Tween(currentPos, this.activeTweens)
                        .to(equipmentTargetPos, this.config.animationDuration)
                        .easing(this.getEasingFunction())
                        .onUpdate(() => {
                            equipment.position.copy(currentPos)
                        })
                        .onComplete(() => {
                            this.removeTween(tween)
                            equipResolve()
                        })
                        .start()
                })
                
                animations.push(equipmentAnimation)
            })
            
            Promise.all(animations).then(() => {
                resolve()
            })
        })
    }
    
    /**
     * 动画化楼层位置
     */
    private animateFloorPosition(floor: FloorItem): Promise<void> {
        return new Promise((resolve) => {
            const currentPos = floor.group.position.clone()
            const targetPos = floor.targetPosition.clone()
            
            const tween = new TWEEN.Tween(currentPos, this.activeTweens)
                .to(targetPos, this.config.animationDuration)
                .easing(this.getEasingFunction())
                .onUpdate(() => {
                    floor.group.position.copy(currentPos)
                })
                .onComplete(() => {
                    this.removeTween(tween)
                    resolve()
                })
                .start()
        })
    }
    
    /**
     * 动画化楼层透明度
     */
    private animateFloorOpacity(floor: FloorItem, targetOpacity: number): Promise<void> {
        return new Promise((resolve) => {
            const current = { opacity: floor.opacity }
            
            const tween = new TWEEN.Tween(current, this.activeTweens)
                .to({ opacity: targetOpacity }, this.config.animationDuration)
                .easing(this.getEasingFunction())
                .onUpdate(() => {
                    this.applyFloorOpacity(floor, current.opacity)
                })
                .onComplete(() => {
                    this.removeTween(tween)
                    resolve()
                })
                .start()
        })
    }
    
    /**
     * 应用楼层透明度
     */
    private applyFloorOpacity(floor: FloorItem, opacity: number): void {
        floor.group.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const material = Array.isArray(child.material) ? child.material : [child.material]
                material.forEach(mat => {
                    if (mat instanceof THREE.Material) {
                        mat.transparent = opacity < 1.0
                        mat.opacity = opacity
                        mat.needsUpdate = true
                    }
                })
            }
        })
    }
    
    /**
     * 获取缓动函数
     */
    private getEasingFunction(): (k: number) => number {
        const easingMap: { [key: string]: (k: number) => number } = {
            'Linear.None': TWEEN.Easing.Linear.None,
            'Quadratic.In': TWEEN.Easing.Quadratic.In,
            'Quadratic.Out': TWEEN.Easing.Quadratic.Out,
            'Quadratic.InOut': TWEEN.Easing.Quadratic.InOut,
            'Cubic.In': TWEEN.Easing.Cubic.In,
            'Cubic.Out': TWEEN.Easing.Cubic.Out,
            'Cubic.InOut': TWEEN.Easing.Cubic.InOut,
        }
        
        return easingMap[this.config.easingFunction] || TWEEN.Easing.Quadratic.InOut
    }
    
    /**
     * 移除动画补间
     */
    private removeTween(tween: TWEEN.Tween<any>): void {
        this.activeTweens.remove(tween)
    }
    
    /**
     * 停止所有动画
     */
    public stopAllAnimations(): void {
        this.activeTweens.removeAll()
    }
    
    /**
     * 获取当前状态
     */
    public getCurrentState(): FloorState {
        return this.currentState
    }
    
    /**
     * 手动关联设备到指定楼层
     */
    public associateEquipmentToFloor(equipmentName: string, floorNumber: number): boolean {
        const floor = this.floors.get(floorNumber)
        if (!floor) {
            console.warn(`⚠️ 未找到 ${floorNumber} 楼`)
            return false
        }
        
        // 查找设备模型
        const equipment = this.equipmentModels.find(eq => eq.name === equipmentName)
        if (!equipment) {
            console.warn(`⚠️ 未找到设备: ${equipmentName}`)
            return false
        }
        
        // 移除设备在其他楼层的关联
        this.floors.forEach(f => {
            f.associatedEquipment = f.associatedEquipment.filter(eq => eq !== equipment)
        })
        
        // 添加到指定楼层
        floor.associatedEquipment.push(equipment)
        console.log(`🔗 设备 "${equipmentName}" 已手动关联到 ${floorNumber}楼`)
        return true
    }
    
    /**
     * 移除设备关联
     */
    public removeEquipmentAssociation(equipmentName: string): boolean {
        let found = false
        this.floors.forEach(floor => {
            const originalLength = floor.associatedEquipment.length
            floor.associatedEquipment = floor.associatedEquipment.filter(eq => eq.name !== equipmentName)
            if (floor.associatedEquipment.length < originalLength) {
                found = true
                console.log(`🔗 设备 "${equipmentName}" 已从 ${floor.floorNumber}楼移除关联`)
            }
        })
        return found
    }
    
    /**
     * 获取设备关联信息
     */
    public getEquipmentAssociations(): { [floorNumber: number]: string[] } {
        const associations: { [floorNumber: number]: string[] } = {}
        this.floors.forEach((floor, floorNumber) => {
            associations[floorNumber] = floor.associatedEquipment.map(eq => eq.name)
        })
        return associations
    }
    
    /**
     * 获取楼层信息
     */
    public getFloorInfo(): { 
        totalFloors: number
        floorNumbers: number[]
        currentState: FloorState
        focusedFloor: number | null
        floors: { [key: number]: { floorNumber: number, isVisible: boolean, opacity: number, nodeCount: number } }
    } {
        const floors: { [key: number]: { floorNumber: number, isVisible: boolean, opacity: number, nodeCount: number } } = {}
        
        this.floors.forEach((floor, floorNumber) => {
            floors[floorNumber] = {
                floorNumber: floor.floorNumber,
                isVisible: floor.isVisible,
                opacity: floor.opacity,
                nodeCount: floor.nodeCount
            }
        })
        
        return {
            totalFloors: this.floors.size,
            floorNumbers: Array.from(this.floors.keys()).sort((a, b) => a - b),
            currentState: this.currentState,
            focusedFloor: this.focusedFloor,
            floors: floors
        }
    }
    
    /**
     * 更新动画（在渲染循环中调用）
     */
    public update(): void {
        this.activeTweens.update()
    }
    
    /**
     * 销毁插件
     */
    public destroy(): void {
        this.stopAllAnimations()
        this.floors.clear()
        this.currentBuildingModel = null
        this.facadeGroup = null
        this.floorsGroup = null
        // 重置外立面状态
        this.hiddenFacades = []
        console.log(`🏗️ ${this.name} 已销毁`)
    }
} 