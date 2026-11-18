class PaymentProcessor {
  pay(amount: number): void {
    console.log("paid");
  }
}
class CheckoutService {
  processor = new PaymentProcessor();
  checkout(amount: number) {
    this.processor.pay(amount);
  }
}
new CheckoutService().checkout(5);
