import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: path.join(__dirname, "../src/index.js"),
  output: {
    path: path.join(__dirname, "../dist"),
    filename: "my-library.js",
    clean: true, // 新增自动清理 dist 目录
    publicPath: "/",
    library: {
      name: "MyLibrary", // 更推荐的对象形式配置
      type: "umd",
    },
    globalObject: "this",
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: "ts-loader",
          options: {
            compilerOptions: {
              esModuleInterop: true, // 确保 loader 使用相同配置
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
    fallback: {
      path: path.resolve(__dirname, "../node_modules/path-browserify"),
    },
  },
  plugins: [],
};
