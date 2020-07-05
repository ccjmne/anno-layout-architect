import { not, exists } from 'src/utils/nullable';

export type TileCoords = { row: number; col: number; }
export type Region = { nw: TileCoords; se: TileCoords; }

export function compareTileCoords(a: TileCoords | null, b: TileCoords | null): boolean {
  return not(a) ? not(b) : exists(b) && a.row === b.row && a.col === b.col;
}

export function compareRegions(a: Region | null, b: Region | null): boolean {
  return not(a) ? not(b) : exists(b) && compareTileCoords(a.nw, b.nw) && compareTileCoords(a.se, b.se);
}
