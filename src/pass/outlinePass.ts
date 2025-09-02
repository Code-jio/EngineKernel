import {
	AdditiveBlending,
	Color,
	DoubleSide,
	HalfFloatType,
	Matrix4,
	MeshDepthMaterial,
	NoBlending,
	RGBADepthPacking,
	ShaderMaterial,
	UniformsUtils,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	WebGLRenderer,
	BufferGeometry,
	Float32BufferAttribute,
	BufferAttribute,
	OrthographicCamera,
	Mesh,
	Material,
	PerspectiveCamera,
	Scene,
} from 'three';

class Pass {
	public isPass: boolean;
	public enabled: boolean;
	public needsSwap: boolean;
	public clear: boolean;
	public renderToScreen: boolean;

	constructor() {
		this.isPass = true;
		// if set to true, the pass is processed by the composer
		this.enabled = true;
		// if set to true, the pass indicates to swap read and write buffer after rendering
		this.needsSwap = true;
		// if set to true, the pass clears its buffer before rendering
		this.clear = false;
		// if set to true, the result of the pass is rendered to screen. This is set automatically by EffectComposer.
		this.renderToScreen = false;
	}

	setSize(width: number, height: number): void {}

	render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
		console.error('THREE.Pass: .render() must be implemented in derived pass.');
	}

	dispose(): void {}
}

const CopyShader = {

	name: 'CopyShader',

	uniforms: {

		'tDiffuse': { value: null },
		'opacity': { value: 1.0 }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>
		}`,

	fragmentShader: /* glsl */`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		#include <common>
		#include <logdepthbuf_pars_fragment>

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;

			#include <logdepthbuf_fragment>
		}`

};

const _camera = new OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

const _geometry = new BufferGeometry();

const positions = new Float32Array( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ] );
const uvs = new Float32Array( [ 0, 2, 0, 0, 2, 0 ] );

_geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
_geometry.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
 

class FullScreenQuad {
	public _mesh: Mesh | null = null;

	constructor( material: Material | null ) {
		if (material) {
			this._mesh = new Mesh( _geometry, material );
		}
	}

	dispose() {
		if (this._mesh) {
			this._mesh.geometry.dispose();
		}

	}

	render( renderer: WebGLRenderer ) {
		if (this._mesh) {
			renderer.render( this._mesh, _camera );
		}
	}

	get material() {
		if (this._mesh) {
			return this._mesh.material;
		}
		return null;
	}

	set material( value ) {
		if (this._mesh && value) {
			this._mesh.material = value;
		}
	}

}

class OutlinePass extends Pass {
	public renderScene: Scene;
	public renderCamera: PerspectiveCamera;
	public selectedObjects: any[];
	public visibleEdgeColor: Color;
	public hiddenEdgeColor: Color;
	public edgeGlow: number;
	public usePatternTexture: boolean;
	public edgeThickness: number;
	public edgeStrength: number;
	public downSampleRatio: number;
	public pulsePeriod: number;
	public _visibilityCache: Map<any, any>;
	public debugMode: boolean = false;  // 调试模式开关
	public resolution: Vector2;
	public renderTargetMaskBuffer: WebGLRenderTarget;
	public depthMaterial: MeshDepthMaterial;
	public prepareMaskMaterial: ShaderMaterial;
	public renderTargetDepthBuffer: WebGLRenderTarget;
	public renderTargetMaskDownSampleBuffer: WebGLRenderTarget;
	public renderTargetBlurBuffer1: WebGLRenderTarget;
	public renderTargetBlurBuffer2: WebGLRenderTarget;
	public edgeDetectionMaterial: ShaderMaterial;
	public renderTargetEdgeBuffer1: WebGLRenderTarget;
	public renderTargetEdgeBuffer2: WebGLRenderTarget;
	public separableBlurMaterial1: ShaderMaterial;
	public separableBlurMaterial2: ShaderMaterial;
	public overlayMaterial: ShaderMaterial;
	public copyUniforms: any;
	public materialCopy: ShaderMaterial;
	public _oldClearColor: Color;
	public oldClearAlpha: number;
	public fsQuad: FullScreenQuad;
	public tempPulseColor1: Color;
	public tempPulseColor2: Color;
	public textureMatrix: Matrix4;
	public patternTexture: any;
	static BlurDirectionX  =new Vector2( 1.0, 0.0 )
	static BlurDirectionY  =new Vector2( 0.0, 1.0 );

	constructor(resolution: any, scene: Scene, camera: PerspectiveCamera, selectedObjects: any[]) {
		super();
		this.renderScene = scene;
		this.renderCamera = camera;
		this.selectedObjects = selectedObjects !== undefined ? selectedObjects : [];
		this.visibleEdgeColor = new Color(1, 1, 1);
		this.hiddenEdgeColor = new Color(0.1, 0.04, 0.02);
		this.edgeGlow = 1.0;  // 增强发光效果
		this.usePatternTexture = false;
		this.edgeThickness = 2.0;  // 增加边缘厚度
		this.edgeStrength = 5.0;   // 增强边缘强度
		this.downSampleRatio = 1;  // 减少降采样，提高质量
		this.pulsePeriod = 0;
		this._visibilityCache = new Map();
		this.resolution = resolution !== undefined ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);
		const resx = Math.round(this.resolution.x / this.downSampleRatio);
		const resy = Math.round(this.resolution.y / this.downSampleRatio);
		this.renderTargetMaskBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y);
		this.renderTargetMaskBuffer.texture.name = 'OutlinePass.mask';
		this.renderTargetMaskBuffer.texture.generateMipmaps = false;
		this.depthMaterial = new MeshDepthMaterial();
		this.depthMaterial.side = DoubleSide;
		this.depthMaterial.depthPacking = RGBADepthPacking;
		this.depthMaterial.blending = NoBlending;
		this.prepareMaskMaterial = this.getPrepareMaskMaterial();
		this.prepareMaskMaterial.side = DoubleSide;
		this.prepareMaskMaterial.fragmentShader = replaceDepthToViewZ(this.prepareMaskMaterial.fragmentShader, this.renderCamera);
		this.renderTargetDepthBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, { type: HalfFloatType });
		this.renderTargetDepthBuffer.texture.name = 'OutlinePass.depth';
		this.renderTargetDepthBuffer.texture.generateMipmaps = false;
		this.renderTargetMaskDownSampleBuffer = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
		this.renderTargetMaskDownSampleBuffer.texture.name = 'OutlinePass.depthDownSample';
		this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps = false;
		this.renderTargetBlurBuffer1 = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
		this.renderTargetBlurBuffer1.texture.name = 'OutlinePass.blur1';
		this.renderTargetBlurBuffer1.texture.generateMipmaps = false;
		this.renderTargetBlurBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), { type: HalfFloatType });
		this.renderTargetBlurBuffer2.texture.name = 'OutlinePass.blur2';
		this.renderTargetBlurBuffer2.texture.generateMipmaps = false;
		this.edgeDetectionMaterial = this.getEdgeDetectionMaterial();
		this.renderTargetEdgeBuffer1 = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
		this.renderTargetEdgeBuffer1.texture.name = 'OutlinePass.edge1';
		this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;
		this.renderTargetEdgeBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), { type: HalfFloatType });
		this.renderTargetEdgeBuffer2.texture.name = 'OutlinePass.edge2';
		this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;
		const MAX_EDGE_THICKNESS = 4;
		const MAX_EDGE_GLOW = 4;
		this.separableBlurMaterial1 = this.getSeperableBlurMaterial(MAX_EDGE_THICKNESS);
		this.separableBlurMaterial1.uniforms['texSize'].value.set(resx, resy);
		this.separableBlurMaterial1.uniforms['kernelRadius'].value = 1;
		this.separableBlurMaterial2 = this.getSeperableBlurMaterial(MAX_EDGE_GLOW);
		this.separableBlurMaterial2.uniforms['texSize'].value.set(Math.round(resx / 2), Math.round(resy / 2));
		this.separableBlurMaterial2.uniforms['kernelRadius'].value = MAX_EDGE_GLOW;
		// Overlay material
		this.overlayMaterial = this.getOverlayMaterial();
		// copy material
		const copyShader = CopyShader;
		this.copyUniforms = UniformsUtils.clone(copyShader.uniforms);
		this.materialCopy = new ShaderMaterial({
			uniforms: this.copyUniforms,
			vertexShader: copyShader.vertexShader,
			fragmentShader: copyShader.fragmentShader,
			blending: NoBlending,
			depthTest: false,
			depthWrite: false
		});
		this.enabled = true;
		this.needsSwap = false;
		this._oldClearColor = new Color();
		this.oldClearAlpha = 1;
		this.fsQuad = new FullScreenQuad(null);
		this.tempPulseColor1 = new Color();
		this.tempPulseColor2 = new Color();
		this.textureMatrix = new Matrix4();
		this.patternTexture = null;
		function replaceDepthToViewZ(string: string, camera: PerspectiveCamera) {
			const type = camera.isPerspectiveCamera ? 'perspective' : 'orthographic';
			return string.replace(/DEPTH_TO_VIEW_Z/g, type + 'DepthToViewZ');
		}
	}

	// 验证对象是否适合轮廓渲染
	validateSelectedObjects(): boolean {
		if (this.selectedObjects.length === 0) {
			if (this.debugMode) console.log('OutlinePass: 没有选中对象');
			return false;
		}

		let validObjects = 0;
		for (let i = 0; i < this.selectedObjects.length; i++) {
			const obj = this.selectedObjects[i];
			if (!obj) continue;

			let hasRenderableChild = false;
			obj.traverse((child:any) => {
				if (child.isMesh || child.isSprite || child.isPoints || child.isLine) {
					hasRenderableChild = true;
				}
			});

			if (hasRenderableChild) {
				validObjects++;
				if (this.debugMode) {
				}
			} else {
				if (this.debugMode) {
				}
			}
		}

		return validObjects > 0;
	}

	dispose(): void {
		this.renderTargetMaskBuffer.dispose();
		this.renderTargetDepthBuffer.dispose();
		this.renderTargetMaskDownSampleBuffer.dispose();
		this.renderTargetBlurBuffer1.dispose();
		this.renderTargetBlurBuffer2.dispose();
		this.renderTargetEdgeBuffer1.dispose();
		this.renderTargetEdgeBuffer2.dispose();
		this.depthMaterial.dispose();
		this.prepareMaskMaterial.dispose();
		this.edgeDetectionMaterial.dispose();
		this.separableBlurMaterial1.dispose();
		this.separableBlurMaterial2.dispose();
		this.overlayMaterial.dispose();
		this.materialCopy.dispose();
		this.fsQuad.dispose();
	}

	setSize(width: number, height: number): void {
		this.renderTargetMaskBuffer.setSize(width, height);
		this.renderTargetDepthBuffer.setSize(width, height);
		let resx = Math.round(width / this.downSampleRatio);
		let resy = Math.round(height / this.downSampleRatio);
		this.renderTargetMaskDownSampleBuffer.setSize(resx, resy);
		this.renderTargetBlurBuffer1.setSize(resx, resy);
		this.renderTargetEdgeBuffer1.setSize(resx, resy);
		this.separableBlurMaterial1.uniforms['texSize'].value.set(resx, resy);
		resx = Math.round(resx / 2);
		resy = Math.round(resy / 2);
		this.renderTargetBlurBuffer2.setSize(resx, resy);
		this.renderTargetEdgeBuffer2.setSize(resx, resy);
		this.separableBlurMaterial2.uniforms['texSize'].value.set(resx, resy);
	}

	changeVisibilityOfSelectedObjects(bVisible: boolean): void {
		const cache = this._visibilityCache;
		
		function gatherSelectedMeshesCallBack(object: any) {
			// 支持所有可渲染对象类型
			if (object.isMesh || object.isSprite || object.isPoints || object.isLine || object.isGroup || object.type === 'Group') {
				if (bVisible === true) {
					if (cache.has(object)) {
						object.visible = cache.get(object);
					}
				} else {
					cache.set(object, object.visible);
					object.visible = bVisible;
				}
			}
		}
		
		for (let i = 0; i < this.selectedObjects.length; i++) {
			const selectedObject = this.selectedObjects[i];
			if (this.debugMode) {
			}
			selectedObject.traverse(gatherSelectedMeshesCallBack);
		}
	}

	changeVisibilityOfNonSelectedObjects(bVisible: boolean): void {
		const cache = this._visibilityCache;
		const selectedMeshes: any[] = [];
		function gatherSelectedMeshesCallBack(object: any) {
			if (object.isMesh) selectedMeshes.push(object);
		}
		for (let i = 0; i < this.selectedObjects.length; i++) {
			const selectedObject = this.selectedObjects[i];
			selectedObject.traverse(gatherSelectedMeshesCallBack);
		}
		function VisibilityChangeCallBack(object: any) {
			if (object.isMesh || object.isSprite) {
				// only meshes and sprites are supported by OutlinePass
				let bFound = false;
				for (let i = 0; i < selectedMeshes.length; i++) {
					const selectedObjectId = selectedMeshes[i].id;
					if (selectedObjectId === object.id) {
						bFound = true;
						break;
					}
				}
				if (bFound === false) {
					const visibility = object.visible;
					if (bVisible === false || cache.get(object) === true) {
						object.visible = bVisible;
					}
					cache.set(object, visibility);
				}
			} else if (object.isPoints || object.isLine) {
				// the visibilty of points and lines is always set to false in order to
				// not affect the outline computation
				if (bVisible === true) {
					object.visible = cache.get(object); // restore
				} else {
					cache.set(object, object.visible);
					object.visible = bVisible;
				}
			}
		}
		this.renderScene.traverse(VisibilityChangeCallBack);
	}

	updateTextureMatrix(): void {
		this.textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
		this.textureMatrix.multiply(this.renderCamera.projectionMatrix);
		this.textureMatrix.multiply(this.renderCamera.matrixWorldInverse);
	}

	render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
		if (this.debugMode) {
			this.validateSelectedObjects();
		}
		
		if (this.selectedObjects.length > 0 && this.validateSelectedObjects()) {
			renderer.getClearColor(this._oldClearColor);
			this.oldClearAlpha = renderer.getClearAlpha();
			const oldAutoClear = renderer.autoClear;
			renderer.autoClear = false;
			if (maskActive) renderer.state.buffers.stencil.setTest(false);
			renderer.setClearColor(0xffffff, 1);
			// Make selected objects invisible
			this.changeVisibilityOfSelectedObjects(false);
			const currentBackground = this.renderScene.background;
			this.renderScene.background = null;
			// 1. Draw Non Selected objects in the depth buffer
			this.renderScene.overrideMaterial = this.depthMaterial;
			renderer.setRenderTarget(this.renderTargetDepthBuffer);
			renderer.clear();
			renderer.render(this.renderScene, this.renderCamera);
			// Make selected objects visible
			this.changeVisibilityOfSelectedObjects(true);
			this._visibilityCache.clear();
			// Update Texture Matrix for Depth compare
			this.updateTextureMatrix();
			// Make non selected objects invisible, and draw only the selected objects, by comparing the depth buffer of non selected objects
			this.changeVisibilityOfNonSelectedObjects(false);
			this.renderScene.overrideMaterial = this.prepareMaskMaterial;
			this.prepareMaskMaterial.uniforms['cameraNearFar'].value.set(this.renderCamera.near, this.renderCamera.far);
			this.prepareMaskMaterial.uniforms['depthTexture'].value = this.renderTargetDepthBuffer.texture;
			this.prepareMaskMaterial.uniforms['textureMatrix'].value = this.textureMatrix;
			renderer.setRenderTarget(this.renderTargetMaskBuffer);
			renderer.clear();
			renderer.render(this.renderScene, this.renderCamera);
			this.renderScene.overrideMaterial = null;
			this.changeVisibilityOfNonSelectedObjects(true);
			this._visibilityCache.clear();
			this.renderScene.background = currentBackground;
			// 2. Downsample to Half resolution
			this.fsQuad.material = this.materialCopy;
			this.copyUniforms['tDiffuse'].value = this.renderTargetMaskBuffer.texture;
			renderer.setRenderTarget(this.renderTargetMaskDownSampleBuffer);
			renderer.clear();
			this.fsQuad.render(renderer);
			this.tempPulseColor1.copy(this.visibleEdgeColor);
			this.tempPulseColor2.copy(this.hiddenEdgeColor);
			if (this.pulsePeriod > 0) {
				const scalar = (1 + 0.25) / 2 + Math.cos(performance.now() * 0.01 / this.pulsePeriod) * (1.0 - 0.25) / 2;
				this.tempPulseColor1.multiplyScalar(scalar);
				this.tempPulseColor2.multiplyScalar(scalar);
			}
			// 3. Apply Edge Detection Pass
			this.fsQuad.material = this.edgeDetectionMaterial;
			this.edgeDetectionMaterial.uniforms['maskTexture'].value = this.renderTargetMaskDownSampleBuffer.texture;
			this.edgeDetectionMaterial.uniforms['texSize'].value.set(this.renderTargetMaskDownSampleBuffer.width, this.renderTargetMaskDownSampleBuffer.height);
			this.edgeDetectionMaterial.uniforms['visibleEdgeColor'].value = this.tempPulseColor1;
			this.edgeDetectionMaterial.uniforms['hiddenEdgeColor'].value = this.tempPulseColor2;
			renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
			renderer.clear();
			this.fsQuad.render(renderer);
			// 4. Apply Blur on Half res
			this.fsQuad.material = this.separableBlurMaterial1;
			this.separableBlurMaterial1.uniforms['colorTexture'].value = this.renderTargetEdgeBuffer1.texture;
			this.separableBlurMaterial1.uniforms['direction'].value = OutlinePass.BlurDirectionX;
			this.separableBlurMaterial1.uniforms['kernelRadius'].value = this.edgeThickness;
			renderer.setRenderTarget(this.renderTargetBlurBuffer1);
			renderer.clear();
			this.fsQuad.render(renderer);
			this.separableBlurMaterial1.uniforms['colorTexture'].value = this.renderTargetBlurBuffer1.texture;
			this.separableBlurMaterial1.uniforms['direction'].value = OutlinePass.BlurDirectionY;
			renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
			renderer.clear();
			this.fsQuad.render(renderer);
			// Apply Blur on quarter res
			this.fsQuad.material = this.separableBlurMaterial2;
			this.separableBlurMaterial2.uniforms['colorTexture'].value = this.renderTargetEdgeBuffer1.texture;
			this.separableBlurMaterial2.uniforms['direction'].value = OutlinePass.BlurDirectionX;
			renderer.setRenderTarget(this.renderTargetBlurBuffer2);
			renderer.clear();
			this.fsQuad.render(renderer);
			this.separableBlurMaterial2.uniforms['colorTexture'].value = this.renderTargetBlurBuffer2.texture;
			this.separableBlurMaterial2.uniforms['direction'].value = OutlinePass.BlurDirectionY;
			renderer.setRenderTarget(this.renderTargetEdgeBuffer2);
			renderer.clear();
			this.fsQuad.render(renderer);
			// Blend it additively over the input texture
			this.fsQuad.material = this.overlayMaterial;
			this.overlayMaterial.uniforms['maskTexture'].value = this.renderTargetMaskBuffer.texture;
			this.overlayMaterial.uniforms['edgeTexture1'].value = this.renderTargetEdgeBuffer1.texture;
			this.overlayMaterial.uniforms['edgeTexture2'].value = this.renderTargetEdgeBuffer2.texture;
			this.overlayMaterial.uniforms['patternTexture'].value = this.patternTexture;
			this.overlayMaterial.uniforms['edgeStrength'].value = this.edgeStrength;
			this.overlayMaterial.uniforms['edgeGlow'].value = this.edgeGlow;
			this.overlayMaterial.uniforms['usePatternTexture'].value = this.usePatternTexture;
			if (maskActive) renderer.state.buffers.stencil.setTest(true);
			renderer.setRenderTarget(readBuffer);
			this.fsQuad.render(renderer);
			renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
			renderer.autoClear = oldAutoClear;
		}
		if (this.renderToScreen) {
			this.fsQuad.material = this.materialCopy;
			this.copyUniforms['tDiffuse'].value = readBuffer.texture;
			renderer.setRenderTarget(null);
			this.fsQuad.render(renderer);
		}
	}

	getPrepareMaskMaterial() {

		return new ShaderMaterial( {

			uniforms: {
				'depthTexture': { value: null },
				'cameraNearFar': { value: new Vector2( 0.5, 0.5 ) },
				'textureMatrix': { value: null }
			},

			vertexShader:
				`#include <morphtarget_pars_vertex>
				#include <skinning_pars_vertex>

				varying vec4 projTexCoord;
				varying vec4 vPosition;
				uniform mat4 textureMatrix;

				#include <common>
				#include <logdepthbuf_pars_vertex>

				void main() {

					#include <skinbase_vertex>
					#include <begin_vertex>
					#include <morphtarget_vertex>
					#include <skinning_vertex>
					#include <project_vertex>

					vPosition = mvPosition;

					vec4 worldPosition = vec4( transformed, 1.0 );

					#ifdef USE_INSTANCING

						worldPosition = instanceMatrix * worldPosition;

					#endif
					
					worldPosition = modelMatrix * worldPosition;

					projTexCoord = textureMatrix * worldPosition;

					#include <logdepthbuf_vertex>
				}`,

			fragmentShader:
				`#include <packing>
				varying vec4 vPosition;
				varying vec4 projTexCoord;
				uniform sampler2D depthTexture;
				uniform vec2 cameraNearFar;

				void main() {

					float depth = unpackRGBAToDepth(texture2DProj( depthTexture, projTexCoord ));
					float viewZ = - DEPTH_TO_VIEW_Z( depth, cameraNearFar.x, cameraNearFar.y );
					float depthTest = (-vPosition.z > viewZ) ? 1.0 : 0.0;
					gl_FragColor = vec4(0.0, depthTest, 1.0, 1.0);

				}`

		} );

	}

	getEdgeDetectionMaterial() {

		return new ShaderMaterial( {

			uniforms: {
				'maskTexture': { value: null },
				'texSize': { value: new Vector2( 0.5, 0.5 ) },
				'visibleEdgeColor': { value: new Vector3( 1.0, 1.0, 1.0 ) },
				'hiddenEdgeColor': { value: new Vector3( 1.0, 1.0, 1.0 ) },
			},

			vertexShader:
				`varying vec2 vUv;

				#include <common>
				#include <logdepthbuf_pars_vertex>

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

					#include <logdepthbuf_vertex>
				}`,

			fragmentShader:
				`varying vec2 vUv;

				uniform sampler2D maskTexture;
				uniform vec2 texSize;
				uniform vec3 visibleEdgeColor;
				uniform vec3 hiddenEdgeColor;
				#include <common>
				#include <logdepthbuf_pars_fragment>

				void main() {
					vec2 invSize = 1.0 / texSize;
					vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
					vec4 c1 = texture2D( maskTexture, vUv + uvOffset.xy);
					vec4 c2 = texture2D( maskTexture, vUv - uvOffset.xy);
					vec4 c3 = texture2D( maskTexture, vUv + uvOffset.yw);
					vec4 c4 = texture2D( maskTexture, vUv - uvOffset.yw);
					float diff1 = (c1.r - c2.r)*0.5;
					float diff2 = (c3.r - c4.r)*0.5;
					float d = length( vec2(diff1, diff2) );
					float a1 = min(c1.g, c2.g);
					float a2 = min(c3.g, c4.g);
					float visibilityFactor = min(a1, a2);
					vec3 edgeColor = 1.0 - visibilityFactor > 0.001 ? visibleEdgeColor : hiddenEdgeColor;
					gl_FragColor = vec4(edgeColor, 1.0) * vec4(d);

					#include <logdepthbuf_fragment>
				}`
		} );

	}

	getSeperableBlurMaterial( maxRadius: number ) {

		return new ShaderMaterial( {

			defines: {
				'MAX_RADIUS': maxRadius,
			},

			uniforms: {
				'colorTexture': { value: null },
				'texSize': { value: new Vector2( 0.5, 0.5 ) },
				'direction': { value: new Vector2( 0.5, 0.5 ) },
				'kernelRadius': { value: 1.0 }
			},

			vertexShader:
				`varying vec2 vUv;

				#include <common>
				#include <logdepthbuf_pars_vertex>

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

					#include <logdepthbuf_vertex>
				}`,

			fragmentShader:
				`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;
				uniform float kernelRadius;

				#include <common>
				#include <logdepthbuf_pars_fragment>

				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}

				void main() {
					vec2 invSize = 1.0 / texSize;
					float sigma = kernelRadius/2.0;
					float weightSum = gaussianPdf(0.0, sigma);
					vec4 diffuseSum = texture2D( colorTexture, vUv) * weightSum;
					vec2 delta = direction * invSize * kernelRadius/float(MAX_RADIUS);
					vec2 uvOffset = delta;
					for( int i = 1; i <= MAX_RADIUS; i ++ ) {
						float x = kernelRadius * float(i) / float(MAX_RADIUS);
						float w = gaussianPdf(x, sigma);
						vec4 sample1 = texture2D( colorTexture, vUv + uvOffset);
						vec4 sample2 = texture2D( colorTexture, vUv - uvOffset);
						diffuseSum += ((sample1 + sample2) * w);
						weightSum += (2.0 * w);
						uvOffset += delta;
					}
					gl_FragColor = diffuseSum/weightSum;

					#include <logdepthbuf_fragment>
				}`
		} );

	}

	getOverlayMaterial() {

		return new ShaderMaterial( {

			uniforms: {
				'maskTexture': { value: null },
				'edgeTexture1': { value: null },
				'edgeTexture2': { value: null },
				'patternTexture': { value: null },
				'edgeStrength': { value: 1.0 },
				'edgeGlow': { value: 1.0 },
				'usePatternTexture': { value: 0.0 }
			},

			vertexShader:
				`varying vec2 vUv;

				#include <common>
				#include <logdepthbuf_pars_vertex>

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				
					#include <logdepthbuf_vertex>
				}`,

			fragmentShader:
				`varying vec2 vUv;

				uniform sampler2D maskTexture;
				uniform sampler2D edgeTexture1;
				uniform sampler2D edgeTexture2;
				uniform sampler2D patternTexture;
				uniform float edgeStrength;
				uniform float edgeGlow;
				uniform bool usePatternTexture;

				#include <common>
				#include <logdepthbuf_pars_fragment>

				void main() {
					vec4 edgeValue1 = texture2D(edgeTexture1, vUv);
					vec4 edgeValue2 = texture2D(edgeTexture2, vUv);
					vec4 maskColor = texture2D(maskTexture, vUv);
					vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);
					float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;
					vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;
					vec4 finalColor = edgeStrength * maskColor.r * edgeValue;
					if(usePatternTexture)
						finalColor += + visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);
					gl_FragColor = finalColor;

					#include <logdepthbuf_fragment>
				}`,
			blending: AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			transparent: true
		} );
	}
}
export  default OutlinePass ;