interface DIContainer {
  register<T>(identifier: string, service: T): void;
  resolve<T>(identifier: string): T;
}

class Container implements DIContainer {
  private services = new Map<string, any>();

  register<T>(identifier: string, service: T): void {
    if (this.services.has(identifier)) {
      throw new Error(`Service ${identifier} already registered`);
    }
    this.services.set(identifier, service);
  }

  resolve<T>(identifier: string): T {
    const service = this.services.get(identifier);
    if (!service) {
      throw new Error(`Service ${identifier} not found`);
    }
    return service as T;
  }
}

export const container = new Container();

export function Inject(identifier: string) {
  return (target: any, propertyKey: string) => {
    Object.defineProperty(target, propertyKey, {
      get: () => container.resolve(identifier),
      enumerable: true,
      configurable: true
    });
  };
}