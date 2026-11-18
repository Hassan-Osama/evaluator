function calculateFinalPrice(price: number, discount: number, taxRate: number): number {
  return (price - discount) * (1 + taxRate);
}
console.log(calculateFinalPrice(100, 10, 0.1));
