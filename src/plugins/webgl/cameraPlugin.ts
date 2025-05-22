import { BasePlugin } from "../basePlugin"
import * as THREE from "three"
import EventBus from '../../eventBus/eventBus';

export class CameraPlugin extends BasePlugin {
  private cameraType: 'perspective' | 'orthographic' = 'perspective';
  private activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private aspectRatio = window.innerWidth / window.innerHeight

  constructor(meta: any) {
    super(meta);
    this.activeCamera = new THREE.PerspectiveCamera(45, this.aspectRatio, 0.1, 1000);
  }

  async init(coreInterface: any) {
    this.registerCameraController(coreInterface);
    this.setupViewportListeners();
  }

  private registerCameraController(core: any) {
    core.registerCamera({
      switchType: (type: 'perspective' | 'orthographic') => {
        this.handleCameraSwitch(type);
      },
      getCurrentCamera: () => this.activeCamera
    });
  }

  private handleCameraSwitch(type: string) {
    // 相机切换占位
  }

  private setupViewportListeners() {
    EventBus.on<{ width: number; height: number }>('viewport-resize', (event) => {
      const { width, height } = event as { width: number; height: number };
      this.aspectRatio = width / height;
      this.updateCameraParams();
    });
  }

  private updateCameraParams() {
    if (this.cameraType === 'perspective') {
      (this.activeCamera as THREE.PerspectiveCamera).aspect = this.aspectRatio;
    } else {
      const halfWidth = 100;
      const halfHeight = 100 / this.aspectRatio;
      (this.activeCamera as THREE.OrthographicCamera).left = -halfWidth;
      (this.activeCamera as THREE.OrthographicCamera).right = halfWidth;
      (this.activeCamera as THREE.OrthographicCamera).top = halfHeight;
      (this.activeCamera as THREE.OrthographicCamera).bottom = -halfHeight;
    }
    this.activeCamera.updateProjectionMatrix();
  }
}