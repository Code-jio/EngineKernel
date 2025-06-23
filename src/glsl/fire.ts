const fire = {
    vertexShader:`
        uniform float time;

        varying vec2 vUv;

        void main() {
        vUv = uv;

        vec3 pos = position;
        // 模拟火焰向上膨胀和横向扰动
        pos.y += 0.1 * sin(time + uv.x * 10.0);
        pos.x += 0.05 * sin(time + uv.y * 5.0);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader:`
        uniform float time;

        varying vec2 vUv;

        void main() {
        // 基础颜色混合
        vec3 flameColor = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0), vUv.y);

        // 噪声扰动（简化版，模拟火焰波动）
        float noise = fract(sin(time + vUv.x * 100.0) * 10000.0);
        noise = smoothstep(0.3, 0.7, noise);

        // 高度控制亮度和透明度
        float alpha = smoothstep(0.3, 0.7, vUv.y + 0.2 * noise);

        // 输出颜色和透明度
        gl_FragColor = vec4(flameColor, alpha);
        }
    `
}

export default fire