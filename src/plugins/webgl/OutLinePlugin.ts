import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import {
    EffectComposer,
    RenderPass,
    ShaderPass,
    OutputPass,
    OutlinePass,
} from "../../utils/three-imports"
import { resolve } from "path"
import { rejects } from "assert"

// 该插件主要承担射线拾取的工作，需要维护射线拾取的检测队列
export class OutLinePlugin extends BasePlugin {
    public scene: THREE.Scene
    public camera: THREE.PerspectiveCamera
    public renderer: THREE.WebGLRenderer
    public composer: EffectComposer | null = null
    public outline: any
    private _selectArray: any[]

    constructor(meta: any) {
        super(meta)

        this.scene = meta.userData.scene // 获取主场景
        this.camera = meta.userData.camera // 获取相机
        this.renderer = meta.userData.renderer // 获取相机
        this._selectArray = meta.userData.selectArray

        this.init()
    }
    
    async init(): Promise<void> {
        const that = this

        return new Promise((resolve, reject) => {
            try {
                // 初始化
                that.composer = new EffectComposer(that.renderer)
                const renderPass = new RenderPass(that.scene, that.camera)
                that.composer.addPass(renderPass)

                that.outline = new OutlinePass( new THREE.Vector2( window.innerWidth, window.innerHeight ), that.scene, that.camera, []);
                that.composer.addPass(that.outline)

				const textureLoader = new THREE.TextureLoader();
				textureLoader.load( './textures/tri_pattern.jpg',  ( texture ) => {

					that.outline.patternTexture = texture;
					texture.wrapS = THREE.RepeatWrapping;
					texture.wrapT = THREE.RepeatWrapping;

				} );

				const outputPass = new OutputPass();
				that.composer.addPass( outputPass );


                console.log('OutLinePlugin 初始化完成');
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
        if (!this.outline || !this.outline.selectedObjects) {
            console.warn('Outline 插件未初始化');
            return;
        }

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

    // 
    destroy() {}
}
