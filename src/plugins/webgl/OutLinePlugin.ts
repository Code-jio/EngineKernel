import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import {
    EffectComposer,
    RenderPass,
    ShaderPass,
    OutputPass,
    OutlinePass,
} from "../../utils/three-imports"


// 该插件主要承担射线拾取的工作，需要维护射线拾取的检测队列
export class OutLinePlugin extends BasePlugin {
    public scene: THREE.Scene
    public camera: THREE.PerspectiveCamera
    public renderer: THREE.WebGLRenderer
    public composer: EffectComposer | null = null
    public outline: any
    private _selectArray: any[]
    private handleResize: () => void = () => {}

    constructor(meta: any) {
        super(meta)

        this.scene = meta.userData.scene // 获取主场景
        this.camera = meta.userData.camera // 获取相机
        this.renderer = meta.userData.renderer // 获取相机
        this._selectArray = meta.userData.selectArray

        this.init(null)
    }
    
    async init(coreInterface: any): Promise<void> {
        const that = this

        return new Promise((resolve, reject) => {
            try {
                // 初始化
                that.composer = new EffectComposer(that.renderer)
                const renderPass = new RenderPass(that.scene, that.camera)
                that.composer.addPass(renderPass)

                // 创建轮廓通道
                that.outline = new OutlinePass(
                    new THREE.Vector2(window.innerWidth, window.innerHeight), 
                    that.scene, 
                    that.camera, 
                    []
                );
                
                // 配置轮廓参数 - 使用更明显的设置
                that.outline.visibleEdgeColor.set('#00ff00'); // 亮绿色可见边缘
                that.outline.hiddenEdgeColor.set('#ff0000');   // 红色隐藏边缘
                that.outline.edgeThickness = 4.0;              // 增加边缘厚度
                that.outline.edgeStrength = 10.0;              // 增强边缘强度
                that.outline.edgeGlow = 2.0;                   // 增强边缘发光
                that.outline.downSampleRatio = 1;              // 减少降采样以提高质量
                that.outline.pulsePeriod = 2;                  // 添加脉冲效果
                
                // 启用调试模式
                that.outline.debugMode = true;
                
                // 添加轮廓通道到composer
                that.composer.addPass(that.outline)
                
                // 注意：移除OutputPass，因为OutlinePass已经设置了renderToScreen=true
                // OutputPass可能会覆盖轮廓效果
                
                this.update()
                this.resize()

                console.log('OutLinePlugin 初始化完成，调试模式已开启');
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    get selectArray(){
        return this._selectArray;
    }

    set selectArray(value){
        this._selectArray = value;
    }
    
    // 清除目前渲染的外部轮廓，清空outline内部的数组即可
    clearOutline(){
        if (this.outline && this.outline.selectedObjects) {
            this.outline.selectedObjects = [];
            console.log('外部轮廓已清除');
        }
    }

    // 添加高亮外轮廓：向outline内部的数组添加对象即可
    addOutline(objects: THREE.Object3D | THREE.Object3D[]) {
        if (!this.outline) {
            console.warn('Outline 插件未初始化', this.outline);
            return;
        }
        this.outline.selectedObjects = []; // 清空当前选中对象

        // 确保处理的是数组
        const objectsArray = Array.isArray(objects) ? objects : [objects];
        
        // 过滤掉无效对象和重复对象
        const validObjects = objectsArray.filter(obj => 
            obj && 
            obj instanceof THREE.Object3D && 
            !this.outline.selectedObjects.includes(obj)
        );

        if (validObjects.length > 0) {
            this.outline.selectedObjects.push(...validObjects);
            console.log(`已添加 ${validObjects.length} 个对象到外部轮廓`, validObjects);
        }
    }

    // 获取当前选中的对象
    getSelectedObjects() {
        return this.outline?.selectedObjects || [];
    }

    // 强制渲染一次
    render() {
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // 
    destroy() { 
        eventBus.off('update', this.render)
        eventBus.off('resize', this.handleResize)

        if (this.outline) {
            this.outline.selectedObjects = []
        }
        
        if (this.composer) {
            this.composer.dispose()
        }
    }
    
    update(){
        eventBus.on('update', () => {
            // 现在通过RenderLoop的渲染任务来处理渲染
            // 这里只需要确保轮廓对象列表是最新的
            if (this.outline) {
                this.outline.selectedObjects = this._selectArray;
            }
        });
    }

    resize() {
        eventBus.on('resize', () => {
            if (this.composer) {
                this.composer.setSize(window.innerWidth, window.innerHeight);
                // 同时更新OutlinePass的分辨率
                if (this.outline) {
                    this.outline.resolution.set(window.innerWidth, window.innerHeight);
                    console.log('OutLinePlugin 调整大小完成');
                }
            }
        });
    }
}
