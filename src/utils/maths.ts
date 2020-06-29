// Like Math#floor, except it works as a Mathematician would expect for negative numbers as well.
// Algorithm: extract absolute value, floor it, restore original sign.
export function floor(v: number): number {
  return Math.sign(v) * Math.floor(Math.abs(v));
}

// Like Math#ceil, except it works as a Mathematician would expect for negative numbers as well.
// Algorithm: extract absolute value, ceil it, restore original sign.
export function ceil(v: number): number {
  return Math.sign(v) * Math.ceil(Math.abs(v));
}
