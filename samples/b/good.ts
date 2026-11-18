class PaymentProcessor {
  pay(amount: number): void {
    console.log(`Processing payment of $${amount}`);
  }
}

class CheckoutService {
  constructor(private processor: PaymentProcessor) {}
  checkout(amount: number): void {
    this.processor.pay(amount);
  }
}

const processor = new PaymentProcessor();
const service = new CheckoutService(processor);
service.checkout(100);
