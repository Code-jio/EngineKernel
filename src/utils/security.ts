import Joi from 'joi';
import { PluginMeta } from '../types/Plugin';

export function validatePlugin(plugin: PluginMeta): boolean {
    const schema = Joi.object({
        name: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/) // 只允许字母、数字、下划线和连字符
            .required(),
        path: Joi.string()
            .pattern(/^(\.\.?\/|[a-zA-Z]:\\|\/)/) // 允许相对路径和绝对路径 必须是/开头 或者是C:\开头
            .required(),
        version: Joi.string()
            .pattern(/^\d+\.\d+\.\d+$/), // 版本号格式为 x.y.z
        dependencies: Joi.array().items(Joi.string()) // 依赖项必须是字符串数组
    });

    const { error } = schema.validate(plugin);

    if (error) {
        throw new Error(`Plugin validation failed: ${error.details[0].message}`);
    }

    return true;
}