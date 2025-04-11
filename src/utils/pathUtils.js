import path from 'path';

export const pathUtils = {
  resolvePath: (basePath, relativePath) => path.resolve(basePath, relativePath),
  joinPath: (...paths) => path.join(...paths),
  isValidPath: (filePath) => {
    const validPattern = /^(\.\.?\/|[a-zA-Z]:\\|\/)/; // 允许相对路径和绝对路径
    return typeof filePath === 'string' && validPattern.test(filePath);
  }
}