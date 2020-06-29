export function mod(dividend: number, divisor: number): number {
  return ((dividend % divisor) + divisor) % divisor;
}
