import * as THREE from "three"
import Stats from "three/examples/jsm/libs/stats.module"
import BasePlugin from "plugins/basePlugin"
import eventBus from "eventBus/eventBus"

export default class AnimationControls extends BasePlugin {
    // private target: THREE.Scene
    private mixer: THREE.AnimationMixer
    private action: THREE.AnimationAction
    private clip: THREE.AnimationClip
    // private loader: THREE.AnimationLoader
    private animationName: string
    private localRoot: THREE.Object3D
    private duration: number
    private tracks: THREE.KeyframeTrack[]
    private isPlaying: boolean = false

    constructor(meta: any) {
        super(meta)
        this.animationName = meta.userData.name
        this.localRoot = meta.userData.gltf
        this.duration = meta.userData.duration
        this.tracks = meta.userData.tracks

        this.mixer = new THREE.AnimationMixer(this.localRoot)
        this.clip = new THREE.AnimationClip(this.animationName, this.duration, this.tracks)
        this.action = new THREE.AnimationAction(this.mixer, this.clip, this.localRoot)
    }

    // 后续功能扩展 动画播放，动画暂停，循环播放，动画状态重置，动画过渡
    // 上一帧，下一帧，动画关键帧轨道剪辑

    update() {
        eventBus.on("update", () => {
            this.mixer.update(new THREE.Clock().getDelta())
        })
    }
    
}
