import { not, exists } from 'src/utils/nullable';

export type TileCoords = { row: number; col: number; }
export type Region = { nw: TileCoords; se: TileCoords; }

export function compareCoordinates(a: TileCoords | null, b: TileCoords | null): boolean {
  return not(a) ? not(b) : exists(b) && a.row === b.row && a.col === b.col;
}

export function compareRegions(a: Region | null, b: Region | null): boolean {
  return not(a) ? not(b) : exists(b) && compareCoordinates(a.nw, b.nw) && compareCoordinates(a.se, b.se);
}
