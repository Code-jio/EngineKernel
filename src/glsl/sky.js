
import { THREE } from "../utils/three-imports"

// 在文件开头添加 GLSL 精度声明
const HEADER = 'precision highp float;\n';

const SkyShader = {
    uniforms: {
        turbidity: { value: 10 },
        rayleigh: { value: 2 },
        mieCoefficient: { value: 0.005 },
        mieDirectionalG: { value: 0.8 },
        sunPosition: { value: new THREE.Vector3() },
        up: { value: new THREE.Vector3(0, 1, 0) },
    },

    vertexShader: /* glsl */ `

		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;
		uniform vec3 up;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vRayleigh;
		varying float vTurbidity;
		varying float vMieCoefficient;
		// 在顶点着色器中添加 precision 声明
		varying float vMieDirectionalG;

		void main() {

			vWorldPosition = position.xyz;
			vSunDirection = normalize( sunPosition );
			vRayleigh = rayleigh;
			vTurbidity = turbidity;
			vMieCoefficient = mieCoefficient;
			// 修复变量赋值
			vMieDirectionalG = mieCoefficient * 0.8; // 替换硬编码值

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

    fragmentShader: /* glsl */ `

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vRayleigh;
		varying float vTurbidity;
		varying float vMieCoefficient;
		varying float vMieDirectionalG;

		const float PI = 3.1415926535897932384626433832795;
		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at STP
		const float pn = 0.035; // depolarization factor for standard air

		// wavelength of used primaries, according to https://www.opengl.org/discussion_boards/showthread.php/162468-scattering-in-a-nut-shell
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		const float v0 = 2.31E-5; // volume scattering coefficient of the atmosphere
		const float c = 6.0E-5; // total scattering coefficient of the atmosphere
		const vec3 g = vec3( 0.0, 0.0, 0.0 ); // coefficients for the mie phase function

		const float A = 0.15; // Anisotropic factor
		const float B = 0.50; // Anisotropic factor
		const float C = 0.10; // Anisotropic factor
		const float D = 0.20; // Anisotropic factor
		const float E = 0.02; // Anisotropic factor
		const float F = 0.10; // Anisotropic factor

		const vec3 totalRayleigh = vRayleigh * vec3( 5.80E-6, 1.35E-5, 3.31E-5 );

		// mie stuff
		const float mieConst = 1.185E-5; // Mie scattering coefficient
		const vec3 mieLambda = vec3( 680E-9, 550E-9, 450E-9 ); // Wavelengths for Mie scattering

		vec3 rayleighPhase( float cosTheta ) {
			return ( 3.0 / ( 16.0 * PI ) ) * ( 1.0 + cosTheta * cosTheta );
		}

		vec3 hgPhase( float cosTheta, float g ) {
			return ( 1.0 / ( 4.0 * PI ) ) * ( ( 1.0 - g * g ) / pow( 1.0 - 2.0 * g * cosTheta + g * g, 1.5 ) );
		}

		void main() {

			vec3 direction = normalize( vWorldPosition );

			// optical depth at the rayleigh scattering
			float opticalDepth = 0.0;
			// simplified optical depth calculation for a flat atmosphere
			opticalDepth = exp( direction.y * 0.5 ) - exp( -1.0 ); // approximation

			vec3 rayleighColor = totalRayleigh * opticalDepth;

			// extinction (absorbtion + out scattering) 
			// change to a simple exponential decay based on optical depth
			// 在片段着色器中修正数学运算
			vec3 extinction = exp(-(rayleighColor + vMieCoefficient * mieConst * 100.0));

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			vec3 inScattering = rayleighPhase( cosTheta ) * rayleighColor;
			inScattering += hgPhase( cosTheta, vMieDirectionalG ) * vMieCoefficient * mieConst;

			// final color
			gl_FragColor = vec4( inScattering * extinction, 1.0 );

		}
	`,
}

class Sky extends ShaderMaterial {
    constructor() {
        super({
            uniforms: UniformsUtils.merge([
                UniformsUtils.clone(SkyShader.uniforms),
                {
                    // 添加 missing uniforms
                    'up': { value: new Vector3(0, 1, 0) }
                }
            ]),
            vertexShader: SkyShader.vertexShader,
            fragmentShader: SkyShader.fragmentShader,
            transparent: true, // Enable transparency for blending
        })

        this.sunPosition = this.uniforms["sunPosition"].value
        this.turbidity = this.uniforms["turbidity"].value
        this.rayleigh = this.uniforms["rayleigh"].value
        this.mieCoefficient = this.uniforms["mieCoefficient"].value
        // 添加类型断言
        this.mieDirectionalG = /** @type {number} */ (this.uniforms['mieDirectionalG'].value);
    }
}

export { Sky }
