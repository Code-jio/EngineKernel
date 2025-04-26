// LOD多层次渲染插件
import BasePlugin from '../basePlugin'
import eventBus from '../../eventBus/eventBus'
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

export class LODPlugin extends BasePlugin {
    private lodGroups: Map<string, THREE.LOD> = new Map()
    private camera: THREE.PerspectiveCamera
    private scene: THREE.Scene
    private renderer: THREE.WebGLRenderer
    private meta: any

    constructor(meta: any) {
        super(meta)
        this.meta = meta
        this.camera = meta.userData.camera
        this.scene = meta.userData.scene
        this.renderer = meta.userData.renderer
    }

    public initialize() {
        // 注册相机移动事件监听器
        eventBus.on("CAMERA_MOVE", this.updateLODLevels.bind(this))
        eventBus.on('MODEL_LOADED', this.handleModelLoaded)
        this.updateLODLevels()
    }

    private updateLODLevels() {
        // 遍历LOD组，根据相机距离更新LOD层级
        this.lodGroups.forEach(lodGroup => {
            const distance = this.camera.position.distanceTo(lodGroup.position)
            lodGroup.update(this.camera)
        })
    }

    public update() {
        this.updateLODLevels()
    }

    public destroy() {
        eventBus.off("CAMERA_MOVE", this.updateLODLevels)
        eventBus.off('MODEL_LOADED', this.handleModelLoaded)
        this.lodGroups.clear()
    }

    // 添加LOD组
    public addLODGroup(name: string, lodGroup: THREE.LOD) {
        this.lodGroups.set(name, lodGroup)
        this.scene.add(lodGroup)
    }

    // 移除LOD组
    public removeLODGroup(name: string) {
        const lodGroup = this.lodGroups.get(name)
        if (lodGroup) {
            this.scene.remove(lodGroup)
            this.lodGroups.delete(name)
        }
    }

    // 监听相机移动事件
    public onCameraMoved() {
        this.updateLODLevels()
    }

    // 触发LOD更新事件
    private triggerLODUpdatedEvent() {
        eventBus.emit("LOD_UPDATED", { lodGroups: this.lodGroups })
    }

    private handleModelLoaded = (model: THREE.Object3D) => {
        this.addLODGroup(model.uuid, new THREE.LOD().addLevel(model, 0))
        // 针对各种模型的各种层级进行精细化管理（后续开发计划）
    }
}
