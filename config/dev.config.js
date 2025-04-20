import detectPort from "detect-port"
import path from "path"
import baseConfig from "./base.config.js"
import { merge } from "webpack-merge"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default new Promise(async resolve => {
    const port = await detectPort(3000)

    resolve(
        merge(baseConfig, {
            mode: "development",
            entry: './src/index.ts',
            devtool: "eval-source-map",
            devServer: {
                static: {
                    directory: path.join(__dirname, "../dist"),
                    watch: true,
                    serveIndex: true,
                },
                client: {
                    overlay: {
                        errors: true,
                        warnings: false,
                        runtimeErrors: false,
                    },
                    logging: "none",
                },
                static: {
                    directory: path.join(__dirname, "../dist"),
                    watch: true,
                    serveIndex: true,
                },
                // // 新增跨域配置
                // headers: {
                //   'Access-Control-Allow-Origin': '*',
                //   'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                //   'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
                // },
                host: "0.0.0.0",
                port,
                open: true,
                hot: true,
                // 如果需要代理API，可添加以下配置（示例）
                // proxy: {
                //   '/api': {
                //     target: 'http://your-api-server.com',
                //     changeOrigin: true,
                //     pathRewrite: { '^/api': '' }
                //   }
                // }
            },
        }),
    )
})
