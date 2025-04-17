// 验证GL参数函数
export const validateGLParams = (params: any) => {
    if (!params || typeof params !== 'object') {
        throw new Error('Invalid GL parameters')
    }
    return params
}