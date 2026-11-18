interface Loggable {
  logInfo(): void;
}

class Device {
  constructor(protected brand: string, public price: number) {}
}

class Laptop extends Device implements Loggable {
  logInfo(): void {
    console.log(`Laptop brand: ${this.brand}, price: ${this.price}`);
  }
}

new Laptop("Dell", 1200).logInfo();
