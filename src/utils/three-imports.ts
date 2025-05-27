// 统一的Three.js导入文件，避免多实例问题
// 所有Three.js相关的导入都应该通过这个文件

// 核心Three.js库
import * as THREE from 'three';

// 常用扩展模块
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer';
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGPURenderer from 'three/examples/jsm/renderers/webgpu/WebGPURenderer';

// 类型导入
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

// 导出所有内容
export {
    THREE,
    GLTFLoader,
    DRACOLoader,
    OrbitControls,
    CSS3DRenderer,
    CSS3DObject,
    Stats,
    WebGPURenderer,
    type GLTF,
};

// 默认导出THREE
export default THREE; 