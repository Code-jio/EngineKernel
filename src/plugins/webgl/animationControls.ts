import * as THREE from "three"
import Stats from "three/examples/jsm/libs/stats.module"
import BasePlugin from "plugins/basePlugin"

export default class AnimationControls extends BasePlugin {
    private target: THREE.Scene
    private mixer: THREE.AnimationMixer
    private action: THREE.AnimationAction
    private clip: THREE.AnimationClip
    private loader: THREE.AnimationLoader
    private animationName: string


    constructor(meta: any) {
        super({
            ...meta
        })

        this.mixer = new THREE.AnimationMixer(this.animationName)
    }
}
