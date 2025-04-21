import { merge } from "webpack-merge"
import baseConfig from "./base.config.js"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default merge(baseConfig, {
    mode: "production",
    experiments: {
        outputModule: true,
    },
    entry: path.resolve(__dirname, "../src/index.ts"),
    output: {
        path: path.join(__dirname, "../dist"),
        filename: "engine-kernel.min.js",
        publicPath: "/",
        library: {
            name: "EngineKernel",
            type: "umd",
            umdNamedDefine: true,
        },
        iife: true,
        globalObject: "this",
        chunkFormat: "module",
    },
})
