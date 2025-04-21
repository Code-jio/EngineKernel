import * as THREE from "three"
import BasePlugin from "plugins/basePlugin"
import eventBus from "eventBus/eventBus"

export default class Raycast extends BasePlugin {
    private raycaster: THREE.Raycaster
    private mouse: THREE.Vector2
    private camera: THREE.Camera
    private scene: THREE.Scene
    private boundHandler: (e: MouseEvent) => void
    private hoverEnabled = false
    private debugLine: THREE.Line | null = null

    constructor(meta: any) {
        super(meta)

        if (!meta.userData?.camera || !(meta.userData.camera instanceof THREE.Camera)) {
            throw new Error('Raycast plugin requires THREE.Camera instance in meta.userData.camera')
        }
        if (!meta.userData?.scene || !(meta.userData.scene instanceof THREE.Scene)) {
            throw new Error('Raycast plugin requires THREE.Scene instance in meta.userData.scene')
        }

        this.raycaster = new THREE.Raycaster()
        this.mouse = new THREE.Vector2()
        this.camera = meta.userData.camera
        this.scene = meta.userData.scene
        this.boundHandler = this.getSomeThingByRay.bind(this)

        window.addEventListener("click", this.boundHandler)
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
        eventBus.emit('raycast-hit', {
            intersects,
            mouse: this.mouse.clone(),
            camera: this.camera
        });

        // 自动更新调试射线
        if(this.debugLine) {
            this.updateDebugLine(intersects[0]?.point);
        }
    }

    // 新增hover检测
    enableHoverDetection(enable: boolean = true) {
        if(enable && !this.hoverEnabled) {
            window.addEventListener('mousemove', this.boundHandler);
            this.hoverEnabled = true;
        } else if(!enable && this.hoverEnabled) {
            window.removeEventListener('mousemove', this.boundHandler);
            this.hoverEnabled = false;
        }
    }

    // 射线可视化
    enableDebugLine(enable: boolean = true) {
        if(enable && !this.debugLine) {
            this.debugLine = new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({ color: 0xff0000 })
            );
            this.scene.add(this.debugLine);
        } else if(!enable && this.debugLine) {
            this.scene.remove(this.debugLine);
            this.debugLine.geometry.dispose();
            this.debugLine.material.dispose();
            this.debugLine = null;
        }
    }

    private updateDebugLine(endPoint?: THREE.Vector3) {
        const start = this.camera.position;
        const direction = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5)
            .unproject(this.camera)
            .sub(start)
            .normalize();
        
        const points = [start, endPoint || start.clone().add(direction.multiplyScalar(100))];
        this.debugLine.geometry.setFromPoints(points);
    }

    destroy() {
        if (this.boundHandler) {
            window.removeEventListener("click", this.boundHandler)
            window.removeEventListener("mousemove", this.boundHandler)
        }
        this.raycaster = null
        this.mouse = null
        this.camera = null
        this.scene = null
        this.boundHandler = null
    }
}
