import * as THREE from "three"
import BasePlugin from "plugins/basePlugin"

export default class Raycast extends BasePlugin {
    private raycaster: THREE.Raycaster
    private mouse: THREE.Vector2
    private camera: THREE.Camera
    private scene: THREE.Scene

    constructor(meta: any) {
        super(meta)

        this.raycaster = new THREE.Raycaster()
        this.mouse = new THREE.Vector2()
        this.camera = meta.userData.camera
        this.scene = meta.userData.scene

        window.addEventListener("click", (e: MouseEvent) => {
            this.getSomeThingByRay(e)
        })
    }

    getSomeThingByRay(event: MouseEvent){
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1; 
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
 
    const intersects = this.raycaster.intersectObjects(
      this.scene.children,
      true
    );

    if (intersects.length === 0) return;
        const obj = intersects[0].object;
        console.log(obj);
    }
}
