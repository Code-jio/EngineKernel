export interface WebGLParams { [key: string]: any }
export function validateShader(source: string): boolean {
    return /^#version 300 es\n/.test(source);
}
// 验证GL参数函数
export const validateGLParams = (params: WebGLParams): boolean => {
    if (!params || typeof params !== 'object') {
        throw new Error('Invalid GL parameters')
    }
    return true
}