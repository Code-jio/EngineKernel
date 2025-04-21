import BasePlugin from "plugins/basePlugin"
import { Clock } from "three"
import * as THREE from "three"

export default class renderLoop extends BasePlugin {
    private clock: THREE.Clock
    private taskList: []
    constructor(meta: any) {
        super(meta)
        this.clock = new THREE.Clock()
        this.taskList = []
    }

    render() {
        this.taskList.forEach((callback: () => void) => {
            callback()
        })
    }
}
