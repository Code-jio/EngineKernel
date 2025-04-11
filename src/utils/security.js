import Joi from 'joi'; // 添加 Joi 导入

export function validatePlugin(plugin) {
    const schema = Joi.object({
        name: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(), // 限制插件名格式
        path: Joi.string().pattern(/^(\.\.?\/|[a-zA-Z]:\\|\/)/).required(), // 允许相对/绝对路径
        version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).optional(),
        dependencies: Joi.array().items(Joi.string()).optional()
    });

    const { error } = schema.validate(plugin);

    if (error) {
        throw new Error(`Plugin validation failed: ${error.details[0].message}`);
    }

    return true;
}