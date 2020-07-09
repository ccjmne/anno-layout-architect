/* eslint-disable no-bitwise */
/* eslint-disable no-mixed-operators */

const CHARSET_62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

// n: positive integer
// len: resulting length, padded to the left w/ '0's.
export function encode(n: number, len: number): string {
  const s = (function _(nn: number): string {
    return nn ? _(Math.floor(nn / 62)) + CHARSET_62[nn % 62] : '';
  }(n)).padStart(len, '0');

  if (s.length !== len) {
    throw new Error(`Value ${n} can't fit in a 62-base word of ${len} characters`);
  }

  return s;
}

export function decode(s: string): number {
  return s.split('').reverse().reduce((acc, c, i) => acc + CHARSET_62.indexOf(c) * 62 ** i, 0);
}
