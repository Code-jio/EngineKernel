// 核心Three.js库
import * as THREE from 'three';

// 常用扩展模块
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGPURenderer from 'three/examples/jsm/renderers/webgpu/WebGPURenderer';
import { WebGLRenderer } from 'three';
import { Water } from "three/examples/jsm/objects/Water"
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
// 类型导入
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';


import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass'


// 导出所有内容
export {
    THREE,
    GLTFLoader,
    DRACOLoader,
    KTX2Loader,
    MeshoptDecoder,
    RGBELoader,
    EXRLoader,
    OrbitControls,
    CSS3DRenderer,
    CSS3DObject,
    Stats,
    Water,
    WebGPURenderer,
    WebGLRenderer,
    type GLTF,

    EffectComposer,
    RenderPass,
    UnrealBloomPass,
    ShaderPass,
    FXAAShader,
    OutputPass,

    CSS2DRenderer,
    CSS2DObject,
};

// 默认导出THREE
export default THREE; 