import * as THREE from "three"
import Stats from "three/examples/jsm/libs/stats.module"
import BasePlugin from "plugins/basePlugin"

export default class Performance extends BasePlugin {
    private dom: HTMLDivElement
    private stats: Stats
    constructor(meta: any) {
        super({
            userData: {},
            ...meta,
            strategy: "async",
        })

        this.dom = document.createElement("div")
        this.stats = new Stats()
        this.stats.showPanel(3)
    }
}
