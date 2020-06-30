export function mod(dividend: number, divisor: number): number {
  return ((dividend % divisor) + divisor) % divisor;
}

export function randomInt(lo: number = 0, hi: number = 1) {
  return Math.round(lo + Math.random() * (hi - lo));
}
