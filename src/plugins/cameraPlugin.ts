import { PerspectiveCamera, OrthographicCamera } from 'three';
import { BasePlugin } from './basePlugin';
import EventBus from '../eventBus/eventBus';

export class CameraPlugin extends BasePlugin {
  private cameraType: 'perspective' | 'orthographic' = 'perspective';
  private activeCamera: PerspectiveCamera | OrthographicCamera;
  private aspectRatio = 16 / 9;

  constructor(meta: any) {
    super({
      ...meta,
      dependencies: ['CoreService', 'EventService'],
      strategy: 'async'
    });
    this.activeCamera = new PerspectiveCamera(45, this.aspectRatio, 0.1, 1000);
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
    EventBus.on('viewport-resize', ({ width, height }: { width: number; height: number }) => {
      this.aspectRatio = width / height;
      this.updateCameraParams();
    });
  }

  private updateCameraParams() {
    if (this.cameraType === 'perspective') {
      (this.activeCamera as PerspectiveCamera).aspect = this.aspectRatio;
    } else {
      const halfWidth = 100;
      const halfHeight = 100 / this.aspectRatio;
      (this.activeCamera as OrthographicCamera).left = -halfWidth;
      (this.activeCamera as OrthographicCamera).right = halfWidth;
      (this.activeCamera as OrthographicCamera).top = halfHeight;
      (this.activeCamera as OrthographicCamera).bottom = -halfHeight;
    }
    this.activeCamera.updateProjectionMatrix();
  }
}