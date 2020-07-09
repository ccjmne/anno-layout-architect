import { Building, typeFor } from 'src/designer-engine/building.class';
import { TileCoords, ORIENTATION } from 'src/designer-engine/definitions';
import { encode, decode } from 'src/utils/base62';

import { EncoderDecoder } from './encoder-decoder.abstract.class';

/* eslint-disable no-bitwise */
/* eslint-disable no-mixed-operators */

// Words sizes, in bits
const TYPE_ID_SIZE: number = 8;
const TYPE_COUNT_SIZE: number = 3;
const TYPE_BUILDINGS_CHUNKSIZE: number = 2 ** TYPE_COUNT_SIZE;
const BUILDING_COORD_SIZE: number = 8;

const COORDS_AND_ORIENTATION = {
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

const TYPE_AND_COUNT = {
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

export class EncodeDecoderV1 extends EncoderDecoder<Building[]> {

  // Shouldn't apply to overridden abstract methods
  /* eslint-disable class-methods-use-this */

  public get version(): number {
    return 0;
  }

  protected encodeImpl(data: Building[]): string {
    let res: string = '';
    Object.entries(data.reduce((acc, b) => ({ ...acc, [b.type.id]: (acc[b.type.id] || []).concat(b) }), {} as Record<number, Building[]>))
      .map(([type, buildings]) => ({ type: parseInt(type, 10), buildings }))
      .forEach(({ type, buildings }) => {
        while (buildings.length) {
          res += TYPE_AND_COUNT.encode({ type, count: Math.min(buildings.length, TYPE_BUILDINGS_CHUNKSIZE) });
          res += buildings.splice(0, TYPE_BUILDINGS_CHUNKSIZE)
            .map(({ at, orientation }) => COORDS_AND_ORIENTATION.encode({ ...at, orientation })).join('');
        }
      });

    return res;
  }

  protected decodeImpl(): Building[] {
    const res: Building[] = [];
    while (!this.over()) {
      const { type, count } = TYPE_AND_COUNT.decode(this.consume(2));
      res.push(...Array.from({ length: count + 1 }, () => COORDS_AND_ORIENTATION.decode(this.consume(3)))
        .map(({ col, row, orientation }) => new Building(typeFor(type), { col, row }, orientation)));
    }

    return res;
  }

}

export const ENCODER_DECODER_V0 = new EncodeDecoderV1();
