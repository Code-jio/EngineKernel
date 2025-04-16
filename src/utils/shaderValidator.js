import { parseGLSL } from "glsl-parser" // 需要安装依赖

export const validateShader = (shaderCode, shaderType) => {
    // 验证着色器类型
    const validTypes = ['vertex', 'fragment']
    if (!validTypes.includes(shaderType.toLowerCase())) {
        throw new Error(`Invalid shader type: ${shaderType}`)
    }

    // 版本声明检查
    const versionRegex = /^#version\s+\d+\s*(es)?\s*\n/
    if (!versionRegex.test(shaderCode)) {
        throw new Error('Missing or invalid #version declaration')
    }

    // 语法验证
    try {
        const ast = parseGLSL(shaderCode)
    } catch (e) {
        throw new Error(`GLSL syntax error: ${e.message}`)
    }

    // 安全模式检测
    const dangerRules = [
        { pattern: /discard\s*;/gim, msg: 'Discard operation forbidden' }, // 禁止 discard 操作
        {
            pattern: /(for|while)\s*\([^)]*\)\s*{[^}]*}/gim,
            msg: 'Potential infinite loop',
        }, // 禁止循环
        {
            pattern: /#extension\s+GL_OVR_multiview/gim,
            msg: 'Multiview extension not allowed',
        }, // 禁止多视图扩展
    ]

    dangerRules.forEach(rule => {
        if (shaderCode.match(rule.pattern)) {
            throw new Error(`Security violation: ${rule.msg}`)
        }
    })

    // 资源限制检查
    const MAX_CONSTANTS = 256
    const constCount = (shaderCode.match(/const\s+/g) || []).length
    if (constCount > MAX_CONSTANTS) {
        throw new Error(`Exceeded maximum constants (${constCount}/${MAX_CONSTANTS})`)
    }

    return true
}
