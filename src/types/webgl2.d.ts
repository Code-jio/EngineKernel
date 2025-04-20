interface WebGLObject {}

interface WebGLShader extends WebGLObject {
    // 基础着色器类型定义
}

interface WebGLBuffer extends WebGLObject {}

interface WebGLFramebuffer extends WebGLObject {}

interface WebGLTexture extends WebGLObject {}

interface HTMLCanvasElement {
    getContext(contextId: 'webgl2'): WebGL2RenderingContext | null;
}

declare global {
    interface WebGL2RenderingContext extends WebGLRenderingContext {
        createTexture(): WebGLTexture;
        createBuffer(): WebGLBuffer;
        createFramebuffer(): WebGLFramebuffer;
        shaderSource(shader: WebGLShader, source: string): void;
        // 完整的WebGL2扩展方法定义
    }
}

export {
    
};