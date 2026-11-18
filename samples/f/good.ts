function calculateFinalPrice(price: number, discount: number = 0, taxRate?: number): number {
  const discounted = price - discount;
  return taxRate !== undefined ? discounted * (1 + taxRate) : discounted;
}

console.log(calculateFinalPrice(100));
console.log(calculateFinalPrice(100, 10));
console.log(calculateFinalPrice(100, 10, 0.1));
