export default class MyLibrary {
    constructor() {
        this.name = 'MyLibrary';
        this.version = '1.0.0';
    }
    greet() {
        console.log(`Hello from ${this.name} v${this.version}!`);
    }

    hello(){
        console.log('hello')
    }
}