interface Loggable { logInfo(): void; }
class Device {
  private brand: string = "HP";
  public price: number = 10;
}
class Laptop extends Device {
  logInfo() { console.log("laptop"); }
}
