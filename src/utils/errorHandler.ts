export class EngineError extends Error {
  code: string;
  isOperational: boolean;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', isOperational: boolean = true) {
    super(message);
    this.code = code;
    this.isOperational = isOperational;
    this.name = 'EngineError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = {
  log: (error: Error | EngineError) => {
    const timestamp = new Date().toISOString();
    const errorInfo = {
      timestamp,
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof EngineError && { code: error.code })
    };
    
    console.error(`[EngineKernel Error] ${timestamp}:`, errorInfo);
  },

  handle: (error: Error | EngineError, context?: string) => {
    errorHandler.log(error);
    
    // 可以在这里添加更多处理逻辑，如发送到错误监控服务
    if (context) {
      console.error(`Error context: ${context}`);
    }
  }
};

export const asyncHandler = <T extends (...args: any[]) => Promise<any>>(fn: T) => {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (err) {
      errorHandler.handle(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };
};