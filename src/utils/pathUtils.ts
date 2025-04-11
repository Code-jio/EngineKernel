import path from 'path';

export const pathUtils = {
  resolvePath: (basePath: string, relativePath: string): string =>
    path.resolve(basePath, relativePath),

  joinPath: (...paths: string[]): string =>
    path.join(...paths),

  isValidPath: (filePath: string): boolean => {
    const validPattern = /^(\.\.?\/|[a-zA-Z]:\\|\/)/; // 允许相对路径和绝对路径 必须是/开头 或者是C:\开头
    return validPattern.test(filePath);
  }
};