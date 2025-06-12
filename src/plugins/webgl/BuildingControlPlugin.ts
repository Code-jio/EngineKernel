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
        expandDistance: 10,
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

    public async init(scene?: THREE.Scene): Promise<void> {
        console.log(`🏗️ ${this.name} v${this.version} 已初始化`)
        // 如果提供了场景对象，自动发现并设置建筑模型
        if (scene) {
            console.log('🔍 开始自动发现场景中的可交互建筑...')
            const discoveredBuildings = this.autoDiscoverBuildingsInScene(scene)

            if (discoveredBuildings.length > 0) {
                console.log(`🏢 发现 ${discoveredBuildings.length} 个可交互建筑:`,
                    discoveredBuildings.map(b => this.getModelName(b)))

                // 默认使用第一个发现的建筑（可以后续扩展为支持多建筑）
                const primaryBuilding = discoveredBuildings[0]
                console.log(`🎯 设置主建筑: ${this.getModelName(primaryBuilding)}`)

                // 设置建筑模型并进行自动配置
                if (this.setBuildingModel(primaryBuilding)) {
                    // 执行基于命名规则的智能设备关联
                    this.autoAssociateEquipmentByNaming(scene)
                }
            }
        }
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

        // 如果仍然没有楼层组，创建一个并重组楼层结构
        if (!this.floorsGroup) {
            console.log('🔧 创建楼层组并重组楼层结构...')
            this.createAndOrganizeFloorsGroup(model)
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
        // 外立面和楼层组的可能命名关键词（mask优先）
        const facadeKeywords = ['mask', 'facade', 'exterior', 'wall', 'curtain', '外立面', '立面', '幕墙']
        const floorKeywords = ['floor', 'level', 'story', 'storey', '楼层', '层', '楼']

        model.children.forEach(child => {
            const name = child.name.toLowerCase()
            const modelName = this.getModelName(child).toLowerCase()

            // 查找外立面组（优先检查mask关键词）
            if (!this.facadeGroup && facadeKeywords.some(keyword =>
                name.includes(keyword) || modelName.includes(keyword))) {
                this.facadeGroup = child as THREE.Group
                const matchedKeyword = facadeKeywords.find(k => name.includes(k) || modelName.includes(k))
                console.log(`🎯 找到外立面组: ${this.getModelName(child)} (匹配关键词: ${matchedKeyword})`)
            }

            // 查找楼层组（排除外立面）
            else if (!this.floorsGroup && floorKeywords.some(keyword =>
                name.includes(keyword) || modelName.includes(keyword))) {
                this.floorsGroup = child as THREE.Group
                const matchedKeyword = floorKeywords.find(k => name.includes(k) || modelName.includes(k))
                console.log(`🎯 找到楼层组: ${this.getModelName(child)} (匹配关键词: ${matchedKeyword})`)
            }
        })
    }

    /**
     * 尝试智能检测楼层组（排除外立面）
     */
    private attemptSmartFloorGroupDetection(model: THREE.Group): void {
        console.log('🔍 开始智能检测楼层组，基于子节点名称分析...')

        // 外立面关键词（优先检查MASK）
        const facadeKeywords = ['mask', 'facade', 'exterior', 'wall', 'curtain', '外立面', '立面', '幕墙']

        // 楼层关键词
        const floorKeywords = ['floor', 'level', 'story', 'storey', '楼层', '层', '楼']

        // 收集潜在楼层节点和外立面节点
        const potentialFloorNodes: Array<{
            object: THREE.Object3D
            name: string
            modelName: string
            y: number
            floorNumber: number | null
            isFloorCandidate: boolean
        }> = []

        const facadeNodes: THREE.Object3D[] = []

        console.log(`🔍 分析主建筑 "${this.getModelName(model)}" 的 ${model.children.length} 个直接子节点:`)

        // 遍历主建筑的直接子节点
        model.children.forEach((child, index) => {
            const name = child.name.toLowerCase()
            const modelName = this.getModelName(child)
            const modelNameLower = modelName.toLowerCase()

            // 获取世界坐标Y值
            const worldPos = new THREE.Vector3()
            child.getWorldPosition(worldPos)

            console.log(`  [${index}] ${modelName} (${child.type}) - Y: ${worldPos.y.toFixed(2)}`)

            // 1. 检查是否是外立面（优先检查MASK关键词）
            const isFacade = facadeKeywords.some(keyword =>
                name.includes(keyword) || modelNameLower.includes(keyword)
            )

            if (isFacade) {
                facadeNodes.push(child)
                const matchedKeyword = facadeKeywords.find(k => name.includes(k) || modelNameLower.includes(k))
                console.log(`    ✅ 识别为外立面 (关键词: ${matchedKeyword})`)

                // 设置外立面组（如果还没有设置）
                if (!this.facadeGroup) {
                    this.facadeGroup = child as THREE.Group
                    console.log(`    🎯 设置为外立面组`)
                }
                return
            }

            // 2. 检查是否是楼层相关节点
            const isFloorRelated = floorKeywords.some(keyword =>
                name.includes(keyword) || modelNameLower.includes(keyword)
            )

            // 3. 尝试从名称中提取楼层号
            const floorNumber = this.extractFloorNumberFromName(modelName)

            // 4. 判断是否为楼层候选节点
            const isFloorCandidate = isFloorRelated || floorNumber !== null ||
                (child.children.length > 0 && !this.isEquipmentModel(modelName))

            potentialFloorNodes.push({
                object: child,
                name: name,
                modelName: modelName,
                y: worldPos.y,
                floorNumber: floorNumber,
                isFloorCandidate: isFloorCandidate
            })

            if (isFloorCandidate) {
                console.log(`    ✅ 潜在楼层节点 ${floorNumber ? `(${floorNumber}楼)` : '(未识别楼层号)'}`)
            } else {
                console.log(`    ❌ 非楼层节点`)
            }
        })

        console.log(`🔍 检测结果: ${facadeNodes.length} 个外立面节点, ${potentialFloorNodes.filter(n => n.isFloorCandidate).length} 个潜在楼层节点`)

        // 5. 筛选和排序楼层节点
        const floorCandidates = potentialFloorNodes.filter(node => node.isFloorCandidate)

        if (floorCandidates.length === 0) {
            console.warn('⚠️ 未找到任何潜在楼层节点')
            return
        }

        // 按楼层号排序（如果有），否则按Y坐标排序
        floorCandidates.sort((a, b) => {
            // 优先按楼层号排序
            if (a.floorNumber !== null && b.floorNumber !== null) {
                return a.floorNumber - b.floorNumber
            }
            // 如果只有一个有楼层号，有楼层号的优先
            if (a.floorNumber !== null && b.floorNumber === null) return -1
            if (a.floorNumber === null && b.floorNumber !== null) return 1
            // 都没有楼层号时按Y坐标排序
            return a.y - b.y
        })

        floorCandidates.forEach((candidate, index) => {
            console.log(`  [${index + 1}] ${candidate.modelName} ${candidate.floorNumber ? `(${candidate.floorNumber}楼)` : ''} - Y: ${candidate.y.toFixed(2)}`)
        })


        // 6. 将 floorCandidates 作为主建筑模型的楼层组，并把模型绑定到对应的楼层上
        if (floorCandidates.length > 0) {
            // 创建或使用现有的楼层组容器
            if (!this.floorsGroup) {
                // 创建新的楼层组容器
                this.floorsGroup = new THREE.Group()
                this.floorsGroup.name = `${this.getModelName(model)}_FloorsContainer`
                this.floorsGroup.userData = {
                    isFloorsGroup: true,
                    createdBySmartDetection: true
                }
                model.add(this.floorsGroup)
            }

            // 为每个楼层候选创建楼层结构
            floorCandidates.forEach((candidate, index) => {
                // 确定楼层号：优先使用提取的楼层号，否则按顺序分配
                const floorNumber = candidate.floorNumber !== null ? candidate.floorNumber : (index + 1)

                // 创建楼层组
                const floorGroup = new THREE.Group()
                floorGroup.name = `Floor_${floorNumber}`
                floorGroup.userData = {
                    isFloorGroup: true,
                    floorNumber: floorNumber,
                    originalObject: candidate.modelName,
                    detectedBySmartDetection: true
                }

                // 复制原始对象的变换到楼层组
                floorGroup.position.copy(candidate.object.position)
                floorGroup.rotation.copy(candidate.object.rotation)
                floorGroup.scale.copy(candidate.object.scale)

                // 从主建筑中移除原始对象
                if (candidate.object.parent) {
                    candidate.object.parent.remove(candidate.object)
                }

                // 重置原始对象的变换并添加到楼层组
                candidate.object.position.set(0, 0, 0)
                candidate.object.rotation.set(0, 0, 0)
                candidate.object.scale.set(1, 1, 1)
                floorGroup.add(candidate.object)

                // 将楼层组添加到楼层容器
                if (this.floorsGroup) {
                    this.floorsGroup.add(floorGroup)
                }

            })
        }
    }

    /**
     * 创建楼层组并重组楼层结构
     */
    private createAndOrganizeFloorsGroup(model: THREE.Group): void {
        console.log('🔧 开始创建楼层组并重组楼层结构...')

        // 创建新的楼层组
        const floorsGroup = new THREE.Group()
        floorsGroup.name = `${model.name}_Floors`
        floorsGroup.userData = {
            isFloorsGroup: true,
            createdByPlugin: true
        }

        // 外立面关键词（特别包含mask）
        const facadeKeywords = ['mask', 'facade', 'exterior', 'wall', 'curtain', '外立面', '立面', '幕墙']

        // 收集潜在的楼层对象（排除外立面）
        const potentialFloorObjects: THREE.Object3D[] = []
        const facadeObjects: THREE.Object3D[] = []

        model.children.slice().forEach(child => {
            const name = child.name.toLowerCase()
            const modelName = this.getModelName(child).toLowerCase()

            // 检查是否是外立面（优先检查mask关键词）
            const isFacade = facadeKeywords.some(keyword =>
                name.includes(keyword) || modelName.includes(keyword)
            )

            if (isFacade) {
                facadeObjects.push(child)
                console.log(`🎭 识别为外立面: ${this.getModelName(child)} (包含关键词: ${facadeKeywords.find(k => name.includes(k) || modelName.includes(k))})`)

                // 如果还没有外立面组，将第一个外立面对象设为外立面组
                if (!this.facadeGroup) {
                    this.facadeGroup = child as THREE.Group
                    console.log(`🎯 设置外立面组: ${this.getModelName(child)}`)
                }
            } else {
                // 其他对象视为潜在楼层
                potentialFloorObjects.push(child)
                console.log(`🏗️ 识别为潜在楼层: ${this.getModelName(child)}`)
            }
        })

        console.log(`🔍 找到 ${potentialFloorObjects.length} 个潜在楼层对象，${facadeObjects.length} 个外立面对象`)

        // 按Y坐标对潜在楼层对象进行排序
        const sortedFloorObjects = potentialFloorObjects.map(obj => {
            const worldPos = new THREE.Vector3()
            obj.getWorldPosition(worldPos)
            return { object: obj, y: worldPos.y, name: this.getModelName(obj) }
        }).sort((a, b) => a.y - b.y)

        console.log('🔍 楼层对象按高度排序:', sortedFloorObjects.map(f => `${f.name} (Y: ${f.y.toFixed(2)})`))

        // 为每个楼层对象创建楼层组
        sortedFloorObjects.forEach((floorData, index) => {
            const floorNumber = index + 1
            const floorObj = floorData.object

            // 创建楼层组
            const floorGroup = new THREE.Group()
            floorGroup.name = `Floor_${floorNumber}`
            floorGroup.userData = {
                isFloorGroup: true,
                floorNumber: floorNumber,
                originalObject: floorObj.name,
                createdByPlugin: true
            }

            // 复制原始对象的变换
            floorGroup.position.copy(floorObj.position)
            floorGroup.rotation.copy(floorObj.rotation)
            floorGroup.scale.copy(floorObj.scale)

            // 从建筑模型中移除原始对象
            model.remove(floorObj)

            // 重置原始对象的变换并添加到楼层组
            floorObj.position.set(0, 0, 0)
            floorObj.rotation.set(0, 0, 0)
            floorObj.scale.set(1, 1, 1)
            floorGroup.add(floorObj)

            // 将楼层组添加到楼层组容器
            floorsGroup.add(floorGroup)

            console.log(`🎯 创建楼层组: ${floorNumber}楼 (${floorGroup.name}) <- ${floorData.name}`)
        })

        // 将楼层组添加到建筑模型
        model.add(floorsGroup)
        this.floorsGroup = floorsGroup

        console.log(`✅ 楼层重组完成，创建了 ${sortedFloorObjects.length} 个楼层组`)
        console.log(`🏗️ 楼层组: ${floorsGroup.name}，包含 ${floorsGroup.children.length} 个楼层`)

        // 如果没有楼层对象，创建一个默认楼层组
        if (sortedFloorObjects.length === 0) {
            console.log('🎯 没有找到楼层对象，创建默认楼层组')
            const defaultFloorGroup = new THREE.Group()
            defaultFloorGroup.name = 'Floor_1_Default'
            defaultFloorGroup.userData = {
                isFloorGroup: true,
                floorNumber: 1,
                isDefault: true,
                createdByPlugin: true
            }
            floorsGroup.add(defaultFloorGroup)
        }
    }

    /**
     * 初始化楼层数据
     */
    private initializeFloors(): void {
        if (!this.floorsGroup) {
            console.warn('⚠️ 未找到楼层组，无法初始化楼层')
            return
        }

        console.log(`🔍 开始初始化楼层，楼层组: ${this.floorsGroup.name}, 子对象数量: ${this.floorsGroup.children.length}`)

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
                console.log(`🎯 找到标记楼层: ${floorNumber}楼 (${floorGroup.name}) - 原始对象: ${floorGroup.userData.originalObject || '未知'}`)
            }
        })

        // 方法2: 如果没有找到明确标记的楼层，尝试智能创建楼层
        if (this.floors.size === 0) {
            console.log('🔍 未找到明确标记的楼层，尝试智能创建楼层...')
            this.createSmartFloors()
        }

        // 方法3: 如果仍然没有楼层，将建筑的所有直接子对象作为楼层
        if (this.floors.size === 0 && this.currentBuildingModel) {
            console.log('🔍 智能创建失败，尝试将建筑的所有子对象作为楼层...')
            this.createFloorsFromBuildingChildren()
        }
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
     * 从模型名称中提取楼层号
     */
    private extractFloorNumberFromName(modelName: string): number | null {
        if (!modelName) return null

        // 楼层号提取规则
        const patterns = [
            // 格式1: Floor_1, Floor_2, level_1 等
            /(?:floor|level|story|storey)_?(\d+)/i,
            // 格式2: 1F, 2F, 3F 等
            /(\d+)f$/i,
            // 格式3: 一楼, 二楼, 三楼 等中文
            /([一二三四五六七八九十]+)楼/,
            // 格式4: 1楼, 2楼, 3楼 等
            /(\d+)楼/,
            // 格式5: 1层, 2层, 3层 等
            /(\d+)层/,
            // 格式6: L1, L2, L3 等
            /l(\d+)/i,
            // 格式7: B1, B2 等地下楼层（负数）
            /b(\d+)/i
        ]

        for (const pattern of patterns) {
            const match = modelName.match(pattern)
            if (match) {
                const numberStr = match[1]

                // 处理中文数字
                if (/[一二三四五六七八九十]+/.test(numberStr)) {
                    const chineseNumbers: { [key: string]: number } = {
                        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
                        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
                    }
                    return chineseNumbers[numberStr] || null
                }

                const floorNumber = parseInt(numberStr)
                if (!isNaN(floorNumber)) {
                    // 地下楼层处理（B1, B2等作为负数）
                    if (pattern.source.includes('b') || pattern.source.includes('B')) {
                        return -floorNumber
                    }
                    return floorNumber
                }
            }
        }

        return null
    }

    /**
     * 自动发现场景中的可交互建筑（只查找顶层建筑，不包括子节点）
     */
    private autoDiscoverBuildingsInScene(scene: THREE.Scene): THREE.Group[] {
        const buildings: THREE.Group[] = []

        console.log('🔍 查找场景顶层的可交互建筑...')

        // 只遍历场景的直接子对象，避免把楼层子节点误认为建筑
        scene.children.forEach((object) => {
            if (!(object instanceof THREE.Group)) return

            const modelName = this.getModelName(object)

            // 检查是否为标记的建筑模型
            if (object.userData && object.userData.isBuildingModel === true) {
                buildings.push(object)
                console.log(`🏢 发现建筑模型: ${modelName} (标记为isBuildingModel)`)
                return
            }

            // 通过名称模式识别顶层建筑
            if (this.isTopLevelBuildingModel(modelName, object)) {
                // 为未标记的建筑模型添加标记
                if (!object.userData) {
                    object.userData = {}
                }
                object.userData.isBuildingModel = true
                object.userData.isInteractive = true

                buildings.push(object)
                console.log(`🏢 发现建筑模型: ${modelName} (通过名称模式识别)`)
            }
        })

        return buildings
    }

    /**
     * 判断是否为顶层建筑模型（只识别主建筑，不包括楼层或设备）
     */
    private isTopLevelBuildingModel(modelName: string, object: THREE.Group): boolean {
        const upperName = modelName.toUpperCase()

        // 1. 必须包含建筑关键词
        const buildingKeywords = ['BUILDING', '建筑', 'HOUSE', 'STRUCTURE']
        const hasBuildingKeyword = buildingKeywords.some(keyword => upperName.includes(keyword))

        if (!hasBuildingKeyword) {
            return false
        }

        // 2. 排除设备命名模式（建筑名_nF_设备名）
        const equipmentPattern = /^.+_\d+F_.+$/i
        if (equipmentPattern.test(modelName)) {
            console.log(`🚫 排除设备模型: ${modelName} (符合设备命名模式)`)
            return false
        }

        // 3. 排除楼层命名模式（Floor_X, 楼层_X, Level_X等）
        const floorPatterns = [
            /^(floor|楼层|level|story|storey)_?\d+$/i,
            /^\d+(f|楼|层)$/i,
            /^(一|二|三|四|五|六|七|八|九|十)楼$/i
        ]
        const isFloorName = floorPatterns.some(pattern => pattern.test(modelName))
        if (isFloorName) {
            console.log(`🚫 排除楼层对象: ${modelName} (符合楼层命名模式)`)
            return false
        }

        // 4. 排除设备关键词
        const equipmentKeywords = ['设备', 'EQUIPMENT', '空调', '消防', '电梯', 'HVAC', 'FIRE', 'ELEVATOR']
        const hasEquipmentKeyword = equipmentKeywords.some(keyword => upperName.includes(keyword))

        if (hasEquipmentKeyword) {
            console.log(`🚫 排除设备对象: ${modelName} (包含设备关键词)`)
            return false
        }

        // 5. 检查对象结构特征（主建筑通常有较多子对象）
        if (object.children.length < 1) {
            console.log(`🚫 排除空对象: ${modelName} (无子对象)`)
            return false
        }

        console.log(`✅ 确认为顶层建筑模型: ${modelName}`)
        return true
    }

    /**
     * 判断是否为设备模型
     */
    private isEquipmentModel(modelName: string): boolean {
        const upperName = modelName.toUpperCase()

        // 1. 检查设备命名模式（建筑名_nF_设备名 或 建筑名_nF_房间_设备名）
        const equipmentPattern = /^.+_\d+F_.+$/i
        if (equipmentPattern.test(modelName)) {
            return true
        }

        // 2. 检查设备关键词
        const equipmentKeywords = ['设备', 'EQUIPMENT', '空调', '消防', '电梯', 'HVAC', 'FIRE', 'ELEVATOR',
            '厨具', '家具', 'FURNITURE', '灯具', 'LIGHT', '管道', 'PIPE']
        const hasEquipmentKeyword = equipmentKeywords.some(keyword => upperName.includes(keyword))

        return hasEquipmentKeyword
    }

    /**
     * 解析设备名称信息
     * 支持格式: 建筑名_nF_房间号_设备名 或 建筑名_nF_设备名
     */
    private parseEquipmentNameInfo(equipmentName: string): {
        buildingName: string | null
        floorNumber: number | null
        roomNumber: string | null
        deviceName: string | null
        isValid: boolean
    } {
        // 设备命名规则: 建筑名_nF_房间号_设备名 或 建筑名_nF_设备名
        const patterns = [
            // 格式1: 建筑名_nF_房间号_设备名 (如: MAIN_BUILDING_2F_K202_空调)
            /^(.+?)_(\d+)F_([A-Z]\d+)_(.+)$/i,
            // 格式2: 建筑名_nF_设备名 (如: MAIN_BUILDING_3F_消防设备)
            /^(.+?)_(\d+)F_(.+)$/i
        ]

        for (const pattern of patterns) {
            const match = equipmentName.match(pattern)
            if (match) {
                if (match.length === 5) {
                    // 格式1: 包含房间号
                    return {
                        buildingName: match[1],
                        floorNumber: parseInt(match[2]),
                        roomNumber: match[3],
                        deviceName: match[4],
                        isValid: true
                    }
                } else if (match.length === 4) {
                    // 格式2: 不包含房间号
                    return {
                        buildingName: match[1],
                        floorNumber: parseInt(match[2]),
                        roomNumber: null,
                        deviceName: match[3],
                        isValid: true
                    }
                }
            }
        }

        return {
            buildingName: null,
            floorNumber: null,
            roomNumber: null,
            deviceName: null,
            isValid: false
        }
    }

    /**
     * 基于命名规则的智能设备关联（只识别独立的设备模型，不包括建筑内部结构）
     */
    private autoAssociateEquipmentByNaming(scene: THREE.Scene): void {
        if (!this.currentBuildingModel) {
            console.warn('⚠️ 没有设置建筑模型，跳过设备关联')
            return
        }

        console.log('🔧 开始基于命名规则的智能设备关联...')

        const currentBuildingName = this.getModelName(this.currentBuildingModel).toUpperCase()
        console.log(`🏢 当前建筑: ${currentBuildingName}`)

        // 1. 扫描场景中的所有独立设备模型
        const discoveredEquipment: Array<{
            object: THREE.Object3D
            nameInfo: {
                buildingName: string | null
                floorNumber: number | null
                roomNumber: string | null
                deviceName: string | null
                isValid: boolean
            }
            modelName: string
        }> = []

        this.findEquipmentInScene(scene, discoveredEquipment)

        if (discoveredEquipment.length === 0) {
            console.log('🔧 场景中未发现符合命名规则的独立设备模型')
            return
        }

        console.log(`🔧 发现 ${discoveredEquipment.length} 个潜在设备模型:`)
        discoveredEquipment.forEach((equipment, index) => {
            const info = equipment.nameInfo
            console.log(`  [${index + 1}] ${equipment.modelName}`)
            console.log(`      建筑: ${info.buildingName}, 楼层: ${info.floorNumber}F, 房间: ${info.roomNumber || '无'}, 设备: ${info.deviceName}`)
        })

        // 2. 筛选属于当前建筑的设备
        const buildingEquipment = discoveredEquipment.filter((equipment) => {
            const buildingName = equipment.nameInfo.buildingName?.toUpperCase()
            return buildingName === currentBuildingName
        })

        if (buildingEquipment.length === 0) {
            console.log(`🔧 没有找到属于建筑 "${currentBuildingName}" 的设备`)
            return
        }

        console.log(`🔧 筛选出 ${buildingEquipment.length} 个属于当前建筑的设备`)

        // 3. 按楼层分组设备
        const equipmentByFloor = new Map<number, Array<typeof buildingEquipment[0]>>()

        buildingEquipment.forEach((equipment) => {
            const floorNumber = equipment.nameInfo.floorNumber!
            if (!equipmentByFloor.has(floorNumber)) {
                equipmentByFloor.set(floorNumber, [])
            }
            equipmentByFloor.get(floorNumber)!.push(equipment)
        })

        console.log(`🔧 设备按楼层分组:`)
        equipmentByFloor.forEach((equipmentList, floorNumber) => {
            console.log(`  ${floorNumber}楼: ${equipmentList.length} 个设备`)
        })

        // 4. 将设备关联到对应楼层
        let totalAssociated = 0
        let totalSkipped = 0

        equipmentByFloor.forEach((equipmentList, floorNumber) => {
            const floor = this.floors.get(floorNumber)

            if (!floor) {
                console.warn(`⚠️ 楼层 ${floorNumber} 不存在，跳过 ${equipmentList.length} 个设备`)
                totalSkipped += equipmentList.length
                return
            }

            console.log(`🔧 开始关联 ${floorNumber}楼的 ${equipmentList.length} 个设备...`)

            equipmentList.forEach((equipment) => {
                try {
                    // 将设备从场景中移除并添加到楼层组中
                    this.associateEquipmentToFloor(equipment.object, floor, equipment.modelName)
                    totalAssociated++
                } catch (error) {
                    console.error(`❌ 关联设备失败: ${equipment.modelName}`, error)
                    totalSkipped++
                }
            })
        })

        console.log(`🔧 设备关联完成: 成功 ${totalAssociated} 个, 跳过 ${totalSkipped} 个`)

        // 5. 更新楼层信息
        this.floors.forEach((floor) => {
            if (floor.associatedEquipment.length > 0) {
                console.log(`📊 ${floor.floorNumber}楼关联了 ${floor.associatedEquipment.length} 个设备:`, 
                    floor.associatedEquipment.map((eq) => this.getModelName(eq)))
            }
        })
    }

    /**
     * 在场景中查找设备模型（只查找独立的设备模型，排除建筑内部结构）
     */
    private findEquipmentInScene(scene: THREE.Scene, equipmentList: Array<{
        object: THREE.Object3D
        nameInfo: {
            buildingName: string | null
            floorNumber: number | null
            roomNumber: string | null
            deviceName: string | null
            isValid: boolean
        }
        modelName: string
    }>): void {
        console.log('🔍 开始扫描场景中的独立设备模型...')
        
        scene.children.forEach((object) => {
            this.findEquipmentInObject(object, equipmentList)
        })
        
        console.log(`🔍 场景扫描完成，共发现 ${equipmentList.length} 个设备模型`)
    }

    /**
     * 在对象中查找设备模型（递归查找，但排除建筑内部结构）
     */
    private findEquipmentInObject(object: THREE.Object3D, equipmentList: Array<{
        object: THREE.Object3D
        nameInfo: {
            buildingName: string | null
            floorNumber: number | null
            roomNumber: string | null
            deviceName: string | null
            isValid: boolean
        }
        modelName: string
    }>): void {
        const modelName = this.getModelName(object)

        // 如果是建筑模型，跳过其内部结构（避免把楼层误认为设备）
        if (object instanceof THREE.Group && object.userData?.isBuildingModel) {
            console.log(`🏢 跳过建筑内部结构: ${modelName}`)
            return
        }

        // 检查当前对象是否是设备
        const nameInfo = this.parseEquipmentNameInfo(modelName)
        if (nameInfo.isValid) {
            equipmentList.push({
                object: object,
                nameInfo: nameInfo,
                modelName: modelName
            })
            console.log(`🔧 发现独立设备模型: ${modelName}`, {
                建筑: nameInfo.buildingName,
                楼层: `${nameInfo.floorNumber}F`,
                房间: nameInfo.roomNumber || '无',
                设备: nameInfo.deviceName
            })
            return // 找到设备后不再遍历其子对象
        }

        // 如果不是设备，继续遍历子对象
        if (object.children && object.children.length > 0) {
            object.children.forEach((child) => {
                this.findEquipmentInObject(child, equipmentList)
            })
        }
    }

    /**
     * 将设备关联到指定楼层
     */
    private associateEquipmentToFloor(equipment: THREE.Object3D, floor: FloorItem, modelName: string): void {
        console.log(`🔧 正在关联设备 "${modelName}" 到 ${floor.floorNumber}楼`)
        // 记录关联关系
        floor.associatedEquipment.push(equipment)
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
     * 从建筑的直接子对象创建楼层（最后的备用方案）
     */
    private createFloorsFromBuildingChildren(): void {
        if (!this.currentBuildingModel) return

        console.log('🔍 将建筑的所有子对象作为楼层处理...')

        // 收集所有可能的楼层对象（排除外立面，特别是mask）
        const potentialFloors: { object: THREE.Object3D, y: number, name: string }[] = []
        const facadeKeywords = ['mask', 'facade', 'exterior', 'wall', 'curtain', '外立面', '立面', '幕墙']

        this.currentBuildingModel.children.forEach((child, index) => {
            const name = child.name.toLowerCase()
            const modelName = this.getModelName(child).toLowerCase()

            // 跳过外立面对象（优先检查mask关键词）
            const isFacade = facadeKeywords.some(keyword =>
                name.includes(keyword) || modelName.includes(keyword)
            )

            if (isFacade) {
                console.log(`🚫 跳过外立面对象: ${this.getModelName(child)} (包含关键词: ${facadeKeywords.find(k => name.includes(k) || modelName.includes(k))})`)
                return
            }

            if (child.type === 'Group' || child.type === 'Mesh') {
                const worldPos = new THREE.Vector3()
                child.getWorldPosition(worldPos)

                potentialFloors.push({
                    object: child,
                    y: worldPos.y,
                    name: modelName || `Floor_${index}`
                })
            }
        })

        // 按Y坐标排序（从低到高）
        potentialFloors.sort((a, b) => a.y - b.y)

        console.log('🔍 从建筑子对象中找到潜在楼层:', potentialFloors.map(f => `${f.name} (Y: ${f.y.toFixed(2)})`))

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
            console.log(`🎯 从建筑子对象创建楼层: ${floorNumber}楼 (${floorData.name}) - 位置: (${originalPosition.x.toFixed(2)}, ${originalPosition.y.toFixed(2)}, ${originalPosition.z.toFixed(2)}) - 世界Y: ${floorData.y.toFixed(2)}`)
        })

        // 如果仍然没有楼层，创建一个默认楼层
        if (this.floors.size === 0) {
            console.log('🎯 创建默认楼层（整个建筑作为一层）')
            const floorItem: FloorItem = {
                group: this.currentBuildingModel,
                floorNumber: 1,
                originalPosition: this.currentBuildingModel.position.clone(),
                targetPosition: this.currentBuildingModel.position.clone(),
                isVisible: true,
                opacity: 1.0,
                nodeCount: this.countFloorNodes(this.currentBuildingModel),
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

        // 外立面关键词（mask优先，包含ResourceReaderPlugin中使用的MASK关键字）
        const facadeKeywords = [
            'mask', 'MASK', 'masks', 'MASKS', // ResourceReaderPlugin中使用的外立面标识（优先）
            'facade', 'facades', '外立面', '立面',
            'exterior', 'curtain', '幕墙', '外墙',
            'cladding', 'skin', 'envelope', '外包围', '建筑表皮',
            'outer', 'outside', 'external',
            'facadegroup', 'facade_group' // 可能的组名称
        ]

        buildingRoot.traverse((child) => {
            const name = child.name.toLowerCase()
            const modelName = this.getModelName(child).toLowerCase()

            // 检查是否匹配外立面关键词（优先检查mask）
            const isFacade = facadeKeywords.some(keyword =>
                name.includes(keyword) || modelName.includes(keyword)
            )

            if (isFacade) {
                // 1. 查找外立面组（可能是由ResourceReaderPlugin创建的）
                if (child.type === 'Group') {
                    facades.push(child)
                    const matchedKeyword = facadeKeywords.find(k => name.includes(k) || modelName.includes(k))
                    console.log(`🎯 找到外立面组: ${this.getModelName(child)} (${child.type}, 匹配: ${matchedKeyword})`)
                    return // 找到外立面组，不需要继续遍历其子节点
                }

                // 2. 查找单独的外立面网格对象
                if (child.type === 'Mesh' || child.type === 'SkinnedMesh') {
                    facades.push(child)
                    const matchedKeyword = facadeKeywords.find(k => name.includes(k) || modelName.includes(k))
                    console.log(`🎯 找到外立面网格: ${this.getModelName(child)} (${child.type}, 匹配: ${matchedKeyword})`)
                }
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
     * 确保有可用的建筑模型
     * 如果当前没有设置建筑模型，会自动从场景中查找并设置
     */
    public ensureBuildingModel(scene?: THREE.Scene): boolean {
        // 如果已有建筑模型，直接返回成功
        if (this.currentBuildingModel && this.floors.size > 0) {
            console.log(`🏗️ 已有建筑模型: ${this.getModelName(this.currentBuildingModel)}`)
            return true
        }

        // 如果没有场景对象，无法自动查找
        if (!scene) {
            console.warn('⚠️ 没有提供场景对象，无法自动查找建筑模型')
            return false
        }

        console.log('🔍 当前没有建筑模型，开始自动查找...')

        // 自动发现并设置建筑模型
        const discoveredBuildings = this.autoDiscoverBuildingsInScene(scene)

        if (discoveredBuildings.length > 0) {
            console.log(`🏢 发现 ${discoveredBuildings.length} 个可交互建筑`)
            
            // 使用第一个发现的建筑
            const primaryBuilding = discoveredBuildings[0]
            const success = this.setBuildingModel(primaryBuilding)
            
            if (success) {
                // 执行设备关联
                this.autoAssociateEquipmentByNaming(scene)
                console.log(`✅ 已自动设置建筑模型: ${this.getModelName(primaryBuilding)}`)
                return true
            }
        }

        console.warn('⚠️ 场景中未找到可用的建筑模型')
        return false
    }

    /**
     * 获取楼层信息（供UI使用）
     */
    public getFloorInfo(): {
        totalFloors: number
        floorNumbers: number[]
        currentState: string
        focusedFloor: number | null
    } {
        return {
            totalFloors: this.floors.size,
            floorNumbers: Array.from(this.floors.keys()).sort((a, b) => a - b),
            currentState: this.currentState,
            focusedFloor: this.focusedFloor
        }
    }

    /**
     * 获取设备关联信息（供UI使用）
     */
    public getEquipmentAssociations(): { [floorNumber: number]: string[] } {
        const associations: { [floorNumber: number]: string[] } = {}
        
        this.floors.forEach((floor, floorNumber) => {
            associations[floorNumber] = floor.associatedEquipment.map(eq => this.getModelName(eq))
        })
        
        return associations
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