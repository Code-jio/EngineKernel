import * as THREE from 'three';

const fireMaterial = new THREE.ShaderMaterial({
    uniforms: {
        // 基础时间和分辨率
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(200, 200) }, // 设置分辨率
        iMouse: { value: new THREE.Vector2(0, 0) }, // 设置鼠标位置
        
        // FireMarker 需要的控制参数
        time: { value: 0 }, // 兼容 FireMarker 的时间uniform
        intensity: { value: 1.0 },
        baseColor: { value: new THREE.Color(0xff4400) },
        tipColor: { value: new THREE.Color(0xffff00) },
        opacity: { value: 1.0 },
        flickerIntensity: { value: 0.1 },
        waveAmplitude: { value: 0.1 },
        
        // 高级控制参数
        turbulenceScale: { value: 2.0 },
        windDirection: { value: new THREE.Vector2(0.1, 0.05) },
        windStrength: { value: 0.3 },
        fireHeight: { value: 1.8 },
        coreIntensity: { value: 0.1 },
        edgeSoftness: { value: 0.7 },
        temperatureVariation: { value: 0.4 },
        sparkleIntensity: { value: 0.5 }
    },
    
    vertexShader: `
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    fragmentShader: `
        // Uniforms
        uniform float iTime;
        uniform float time;
        uniform vec2 iResolution;
        uniform vec2 iMouse;
        uniform float intensity;
        uniform vec3 baseColor;
        uniform vec3 tipColor;
        uniform float opacity;
        uniform float flickerIntensity;
        uniform float waveAmplitude;
        uniform float turbulenceScale;
        uniform vec2 windDirection;
        uniform float windStrength;
        uniform float fireHeight;
        uniform float coreIntensity;
        uniform float edgeSoftness;
        uniform float temperatureVariation;
        uniform float sparkleIntensity;
        
        varying vec2 vUv;
        
        // ============================================================================
        // 噪声函数库
        // ============================================================================
        
        vec3 mod289(vec3 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 mod289(vec4 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 permute(vec4 x) {
            return mod289(((x * 34.0) + 1.0) * x);
        }

        vec4 taylorInvSqrt(vec4 r) {
            return 1.79284291400159 - 0.85373472095314 * r;
        }

        // Simplex 3D 噪声函数
        float snoise(vec3 v) { 
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            // 第一个角
            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            // 其他角
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
            vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

            // 排列
            i = mod289(i); 
            vec4 p = permute(
                permute(
                    permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + 
                    i.y + vec4(0.0, i1.y, i2.y, 1.0)
                ) + 
                i.x + vec4(0.0, i1.x, i2.x, 1.0)
            );

            // 梯度: 7x7 点在正方形上，映射到八面体
            // 环大小 17*17 = 289 接近 49 的倍数 (49*6 = 294)
            float n_ = 0.142857142857; // 1.0/7.0
            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z); // mod(p,7*7)

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_); // mod(j,N)

            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0) * 2.0 + 1.0;
            vec4 s1 = floor(b1) * 2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);

            // 标准化梯度
            vec4 norm = inversesqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            // 混合最终噪声值
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        // ============================================================================
        // 随机数生成器
        // ============================================================================
        
        // PRNG - 来源: https://www.shadertoy.com/view/4djSRW
        float prng(in vec2 seed) {
            seed = fract(seed * vec2(5.3983, 5.4427));
            seed += dot(seed.yx, seed.xy + vec2(21.5351, 14.3137));
            return fract(seed.x * seed.y * 95.4337);
        }

        // ============================================================================
        // 噪声堆叠函数
        // ============================================================================
        
        const float PI = 3.1415926535897932384626433832795;

        // 多层噪声堆叠
        float noiseStack(vec3 pos, int octaves, float falloff) {
            float noise = snoise(vec3(pos));
            float off = 1.0;
            
            if (octaves > 1) {
                pos *= 2.0;
                off *= falloff;
                noise = (1.0 - off) * noise + off * snoise(vec3(pos));
            }
            
            if (octaves > 2) {
                pos *= 2.0;
                off *= falloff;
                noise = (1.0 - off) * noise + off * snoise(vec3(pos));
            }
            
            if (octaves > 3) {
                pos *= 2.0;
                off *= falloff;
                noise = (1.0 - off) * noise + off * snoise(vec3(pos));
            }
            
            return (1.0 + noise) / 2.0;
        }

        // UV坐标噪声堆叠
        vec2 noiseStackUV(vec3 pos, int octaves, float falloff, float diff) {
            float displaceA = noiseStack(pos, octaves, falloff);
            float displaceB = noiseStack(pos + vec3(3984.293, 423.21, 5235.19), octaves, falloff);
            return vec2(displaceA, displaceB);
        }

        // ============================================================================
        // 主图像函数
        // ============================================================================
        
        void mainImage(out vec4 fragColor, in vec2 fragCoord) {
            // 使用统一的时间参数
            float currentTime = max(iTime, time);
            vec2 resolution = iResolution.xy;
            vec2 drag = iMouse.xy;
            vec2 offset = iMouse.xy + windDirection * windStrength * 100.0;
            
            // 计算基础坐标
            float xpart = fragCoord.x / resolution.x;
            float ypart = fragCoord.y / resolution.y;
            
            // 应用火焰高度比例
            ypart *= fireHeight;
            
            // 裁剪和衰减计算
            float clip = 210.0 * intensity;
            float ypartClip = fragCoord.y / clip;
            float ypartClippedFalloff = clamp(2.0 - ypartClip, 0.0, 1.0);
            float ypartClipped = min(ypartClip, 1.0);
            float ypartClippedn = 1.0 - ypartClipped;
            
            // 燃料强度
            float xfuel = 1.0 - abs(2.0 * xpart - 1.0);
            xfuel = pow(xfuel, edgeSoftness);
            
            // 时间控制
            float timeSpeed = 0.5 * intensity;
            float realTime = timeSpeed * currentTime;
            
            // 坐标变换和流动效果
            vec2 coordScaled = 0.01 * fragCoord - 0.02 * vec2(offset.x, 0.0);
            vec3 position = vec3(coordScaled, 0.0) + vec3(1223.0, 6434.0, 8425.0);
            
            // 增强风力效果
            vec3 flow = vec3(
                4.1 * (0.5 - xpart) * pow(ypartClippedn, 4.0) + windDirection.x * windStrength * 10.0,
                -2.0 * xfuel * pow(ypartClippedn, 64.0) + windDirection.y * windStrength * 5.0,
                0.0
            );
            vec3 timing = realTime * vec3(0.0, -1.7, 1.1) + flow;
            
            // 位移计算（增强湍流效果）
            vec3 displacePos = vec3(1.0, 0.5, 1.0) * 2.4 * position + realTime * vec3(0.01, -0.7, 1.3);
            vec3 displace3 = vec3(noiseStackUV(displacePos, 2, 0.4 * turbulenceScale, 0.1), 0.0);
            
            // 噪声坐标和火焰计算
            vec3 noiseCoord = (vec3(2.0, 1.0, 1.0) * position + timing + 0.4 * displace3 * turbulenceScale) / 1.0;
            float noise = noiseStack(noiseCoord, 3, 0.4);
            
            // 火焰强度（增加温度变化效果）
            float tempVariation = 1.0 + temperatureVariation * sin(realTime * 3.0 + xpart * 10.0) * flickerIntensity;
            float flames = pow(ypartClipped, 0.3 * xfuel) * pow(noise, 0.3 * xfuel) * tempVariation;
            
            // 火焰颜色（混合基础色和顶部色）
            float f = ypartClippedFalloff * pow(1.0 - flames * flames * flames, 8.0) * intensity;
            float fff = f * f * f;
            
            // 颜色混合
            vec3 fireColor = mix(baseColor, tipColor, ypart);
            fireColor *= 1.5 * (1.0 + coreIntensity);
            vec3 fire = fireColor * vec3(f, fff, fff * fff);
            
            // // 烟雾效果
            // float smokeNoise = 0.5 + snoise(0.4 * position + timing * vec3(1.0, 1.0, 0.2)) / 2.0;
            // vec3 smoke = vec3(0.3 * pow(xfuel, 3.0) * pow(ypart, 2.0) * (smokeNoise + 0.4 * (1.0 - noise)));
            
            // 火花效果（增强）
            float sparkGridSize = 30.0;
            vec2 sparkCoord = fragCoord - vec2(2.0 * offset.x, 190.0 * realTime);
            sparkCoord -= 30.0 * noiseStackUV(0.01 * vec3(sparkCoord, 30.0 * currentTime), 1, 0.4, 0.1);
            sparkCoord += 100.0 * flow.xy;
            
            if (mod(sparkCoord.y / sparkGridSize, 2.0) < 1.0) {
                sparkCoord.x += 0.5 * sparkGridSize;
            }
            
            vec2 sparkGridIndex = vec2(floor(sparkCoord / sparkGridSize));
            float sparkRandom = prng(sparkGridIndex);
            float sparkLife = min(
                10.0 * (1.0 - min((sparkGridIndex.y + (190.0 * realTime / sparkGridSize)) / (24.0 - 20.0 * sparkRandom), 1.0)), 
                1.0
            );
            
            vec3 sparks = vec3(0.0);
            if (sparkLife > 0.0) {
                float sparkSize = xfuel * xfuel * sparkRandom * 0.08 * sparkleIntensity;
                float sparkRadians = 999.0 * sparkRandom * 2.0 * PI + 2.0 * currentTime;
                vec2 sparkCircular = vec2(sin(sparkRadians), cos(sparkRadians));
                vec2 sparkOffset = (0.5 - sparkSize) * sparkGridSize * sparkCircular;
                vec2 sparkModulus = mod(sparkCoord + sparkOffset, sparkGridSize) - 0.5 * vec2(sparkGridSize);
                float sparkLength = length(sparkModulus);
                float sparksGray = max(0.0, 1.0 - sparkLength / (sparkSize * sparkGridSize));
                sparks = sparkLife * sparksGray * vec3(1.0, 0.3, 0.0) * sparkleIntensity;
            }
            
            // 最终颜色合成
            // vec3 finalColor = max(fire, sparks) + smoke;
            vec3 finalColor = max(fire, sparks);
            fragColor = vec4(finalColor, opacity);
        }
        
        void main() {
            // 修正：使用vUv替代gl_FragCoord.xy
            // vUv 的范围是 0.0 到 1.0，代表在几何体上的纹理坐标。
            // 这样可以将火焰效果正确地“贴”在几何体上，而不是固定在屏幕上。
            mainImage(gl_FragColor, vUv * iResolution.xy);
        }
    `,
    
    transparent: true,
    blending: THREE.AdditiveBlending // 增强火焰亮部效果
});

export default fireMaterial;