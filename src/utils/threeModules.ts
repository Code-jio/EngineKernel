// 统一的 THREE.js 模块管理
// 由于我们已经外部化了 THREE.js，这里直接使用全局 THREE 对象

// 声明全局 THREE 类型（避免 TypeScript 报错）
declare global {
    interface Window {
        THREE: any;
    }
    const THREE: any;
}

// 导出 THREE 命名空间（直接使用全局 THREE）
export const THREE = (globalThis as any).THREE || (window as any).THREE;

// 导出常用的模块（从全局 THREE 对象获取）
export const Scene = THREE?.Scene;
export const PerspectiveCamera = THREE?.PerspectiveCamera;
export const OrthographicCamera = THREE?.OrthographicCamera;
export const WebGLRenderer = THREE?.WebGLRenderer;
export const Mesh = THREE?.Mesh;
export const BoxGeometry = THREE?.BoxGeometry;
export const SphereGeometry = THREE?.SphereGeometry;
export const PlaneGeometry = THREE?.PlaneGeometry;
export const MeshBasicMaterial = THREE?.MeshBasicMaterial;
export const MeshStandardMaterial = THREE?.MeshStandardMaterial;
export const MeshPhongMaterial = THREE?.MeshPhongMaterial;
export const Vector3 = THREE?.Vector3;
export const Vector2 = THREE?.Vector2;
export const Color = THREE?.Color;
export const Object3D = THREE?.Object3D;
export const Group = THREE?.Group;
export const Clock = THREE?.Clock;
export const EventDispatcher = THREE?.EventDispatcher;
export const Raycaster = THREE?.Raycaster;
export const DirectionalLight = THREE?.DirectionalLight;
export const AmbientLight = THREE?.AmbientLight;
export const PointLight = THREE?.PointLight;
export const SpotLight = THREE?.SpotLight;
export const TextureLoader = THREE?.TextureLoader;
export const CubeTextureLoader = THREE?.CubeTextureLoader;
export const LoadingManager = THREE?.LoadingManager;
export const AnimationMixer = THREE?.AnimationMixer;
export const AnimationClip = THREE?.AnimationClip;
export const AnimationAction = THREE?.AnimationAction;
export const LoopOnce = THREE?.LoopOnce;
export const LoopRepeat = THREE?.LoopRepeat;
export const LoopPingPong = THREE?.LoopPingPong;
export const Euler = THREE?.Euler;
export const Quaternion = THREE?.Quaternion;
export const Matrix4 = THREE?.Matrix4;
export const BufferGeometry = THREE?.BufferGeometry;
export const BufferAttribute = THREE?.BufferAttribute;
export const Material = THREE?.Material;
export const Texture = THREE?.Texture;
export const CubeTexture = THREE?.CubeTexture;
export const WebGLRenderTarget = THREE?.WebGLRenderTarget;
export const MathUtils = THREE?.MathUtils;
export const MOUSE = THREE?.MOUSE;
export const TOUCH = THREE?.TOUCH;

// Examples 模块（由于 THREE 对象不可扩展，从全局 window 对象获取）
export const OrbitControls = (globalThis as any).OrbitControls || (window as any).OrbitControls;
export const GLTFLoader = (globalThis as any).GLTFLoader || (window as any).GLTFLoader;
export const CSS3DRenderer = (globalThis as any).CSS3DRenderer || (window as any).CSS3DRenderer;
export const CSS3DObject = (globalThis as any).CSS3DObject || (window as any).CSS3DObject;
export const Sky = (globalThis as any).Sky || (window as any).Sky;
export const Stats = (globalThis as any).Stats || (window as any).Stats; 