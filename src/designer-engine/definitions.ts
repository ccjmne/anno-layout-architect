import { BuildingType } from 'src/buildings/definitions';
import { not, exists } from 'src/utils/nullable';

export type TileCoords = { row: number; col: number; }
export type Region = { nw: TileCoords; se: TileCoords; }
export enum ORIENTATION {
  HORIZONTAL = 1,
  VERTICAL = 0,
}

export function compareTileCoords(a: TileCoords | null, b: TileCoords | null): boolean {
  return not(a) ? not(b) : exists(b) && a.row === b.row && a.col === b.col;
}

export function compareRegions(a: Region | null, b: Region | null): boolean {
  return not(a) ? not(b) : exists(b) && compareTileCoords(a.nw, b.nw) && compareTileCoords(a.se, b.se);
}

export function computeRegion({ w, h }: BuildingType, { col, row }: TileCoords, orientation: ORIENTATION): Region {
  return {
    nw: { col, row },
    se: {
      col: col + (orientation === ORIENTATION.HORIZONTAL ? w : h) - 1,
      row: row + (orientation === ORIENTATION.HORIZONTAL ? h : w) - 1,
    },
  };
}

export function overlaps(
  { nw: { col: nwX1, row: nwY1 }, se: { col: seX1, row: seY1 } }: Region,
  { nw: { col: nwX2, row: nwY2 }, se: { col: seX2, row: seY2 } }: Region,
): boolean {
  return seX1 >= nwX2 && seY1 >= nwY2 && nwX1 <= seX2 && nwY1 <= seY2;
}
