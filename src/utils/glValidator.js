// 验证GL参数函数
export const validateGLParams = params => {
    if (!params || typeof params !== 'object') {
        throw new Error('Invalid GL parameters')
    }
    return params
}
