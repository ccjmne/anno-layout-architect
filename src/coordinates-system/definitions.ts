import { Region } from 'src/designer-engine/definitions';

export type Point = { x: number, y: number }; // TODO: rename to PointCoords?
export type Geometrised<Datum> = Datum & { geo: Geometry };
export type Geometry = {
  x: [number, number],
  y: [number, number],
  w: number,
  h: number,
  cols: number,
  rows: number,
  cx: number,
  cy: number
};

export function computeGeometry({ nw, se }: Region, tileSide: number): Geometry {
  const cols = se.col - nw.col + 1;
  const rows = se.row - nw.row + 1;
  return {
    x: [nw.col * tileSide, (se.col + 1) * tileSide],
    y: [nw.row * tileSide, (se.row + 1) * tileSide],
    w: cols * tileSide,
    h: rows * tileSide,
    cols,
    rows,
    cy: (se.row + nw.row + 1) * (tileSide / 2),
    cx: (se.col + nw.col + 1) * (tileSide / 2),
  };
}
