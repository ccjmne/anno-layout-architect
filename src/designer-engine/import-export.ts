import { TileCoords, ORIENTATION } from './definitions';

export const EXPORT_FORMAT_VERSION: number = 0;

// Words sizes, in bits
export const TYPE_ID_SIZE: number = 8;
export const TYPE_COUNT_SIZE: number = 3;
export const TYPE_BUILDINGS_CHUNKSIZE: number = 2 ** TYPE_COUNT_SIZE;
export const BUILDING_COORD_SIZE: number = 8;

const CHARSET_62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

/* eslint-disable no-bitwise */
/* eslint-disable no-mixed-operators */

// n: positive integer
// chars: minimum resulting length, padded to the left w/ '0's.
export function encode(n: number, chars: number = 2): string {
  return (function _(nn: number): string {
    return nn ? _(Math.floor(nn / 62)) + CHARSET_62[nn % 62] : '';
  }(n)).padStart(chars, '0');
}

export function decode(s: string): number {
  return s.split('').reverse().reduce((acc, c, i) => acc + CHARSET_62.indexOf(c) * 62 ** i, 0);
}

export const COORDS_AND_ORIENTATION = {
  // col ∈ [0, 255], 8-bit unsigned integer value
  // row ∈ [0, 255], 8-bit unsigned integer value
  encode({ col, row, orientation }: TileCoords & { orientation: ORIENTATION }) {
    return encode(+(orientation === ORIENTATION.HORIZONTAL) << (BUILDING_COORD_SIZE * 2) | col << BUILDING_COORD_SIZE | row, 3);
  },

  // s ∈ ['000', 'zzz'], 3-char base62 string
  decode(s: string): TileCoords & { orientation: ORIENTATION } {
    const n = decode(s);
    return {
      orientation: n >>> (BUILDING_COORD_SIZE * 2) ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL,
      col: n >>> BUILDING_COORD_SIZE & 0b11111111,
      row: n & 0b11111111,
    };
  },
};

export const TYPE_AND_COUNT = {
  // type ∈ [0, 255], 8-bit unsigned integer value
  // count ∈ [1, 8]. Stored as count - 1, on a 3-bit unsigned integer value
  encode({ type, count }: { type: number, count: number }): string {
    return encode((count - 1) << TYPE_ID_SIZE | type, 2);
  },

  // s ∈ ['00', 'zz'], 3-char base62 string
  decode(s: string): { type: number, count: number } {
    const n = decode(s);
    return { type: n & 0b11111111, count: n >>> TYPE_ID_SIZE };
  },
};
