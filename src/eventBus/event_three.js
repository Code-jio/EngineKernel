class EventDispatcher {
    /**
     * 添加指定类型的事件监听器
     *
     * @param {string} type - 要监听的事件类型
     * @param {Function} listener - 事件触发时执行的回调函数
     */
    addEventListener(type, listener) {
        if (this._listeners === undefined) this._listeners = {}

        const listeners = this._listeners

        if (listeners[type] === undefined) {
            listeners[type] = []
        }

        if (listeners[type].indexOf(listener) === -1) {
            listeners[type].push(listener)
        }
    }

    /**
     * 检查指定监听器是否已注册
     *
     * @param {string} type - 要检查的事件类型
     * @param {Function} listener - 要验证的监听器函数
     * @return {boolean} 监听器是否已注册
     */
    hasEventListener(type, listener) {
        const listeners = this._listeners

        if (listeners === undefined) return false

        return listeners[type] !== undefined && listeners[type].indexOf(listener) !== -1
    }

    /**
     * 移除指定类型的事件监听器
     *
     * @param {string} type - 要移除的事件类型
     * @param {Function} listener - 要移除的监听器函数
     */
    removeEventListener(type, listener) {
        const listeners = this._listeners

        if (listeners === undefined) return

        const listenerArray = listeners[type]

        if (listenerArray !== undefined) {
            const index = listenerArray.indexOf(listener)

            if (index !== -1) {
                listenerArray.splice(index, 1)
            }
        }
    }

    /**
     * 派发事件对象
     *
     * @param {Object} event - 要触发的事件对象
     */
    dispatchEvent(event) {
        const listeners = this._listeners

        if (listeners === undefined) return

        const listenerArray = listeners[event.type]

        if (listenerArray !== undefined) {
            event.target = this

            // Make a copy, in case listeners are removed while iterating.
            const array = listenerArray.slice(0)

            for (let i = 0, l = array.length; i < l; i++) {
                array[i].call(this, event)
            }

            event.target = null
        }
    }
}

export { EventDispatcher }
