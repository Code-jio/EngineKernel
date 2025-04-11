// eslint-disable-next-line import/no-cycle
export default class EventBus {
    constructor() {
        this.listeners = new Map(); // 存储事件和对应的监听器
    }

    // 订阅事件
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    // 取消订阅
    off(event, callback) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            this.listeners.set(
                event,
                handlers.filter((h) => h !== callback),
            );
        }
    }

    // 触发事件
    emit(event, ...args) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.forEach((handler) => handler(...args));
        }
    }

    // 清空所有监听器
    clear() {
        this.listeners.clear();
    }
}

// // 示例用法
// const eventBus = new EventBus();

// // 订阅事件
// eventBus.on('message', (data) => {
//     console.log(`Received message: ${data}`);
// });

// // 触发事件
// eventBus.emit('message', 'Hello, world!'); // 输出: Received message: Hello, world!

// // 取消订阅
// eventBus.off('message', (data) => {
//     console.log(`Received message: ${data}`);
// });

// // 再次触发事件
// eventBus.emit('message', 'Hello, world!'); // 不再输出

// // 清空所有监听器
// eventBus.clear();
