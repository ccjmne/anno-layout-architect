import { exists, not } from 'src/utils/nullable';

import { TYPE_ROAD } from './building-type.class';
import { Building } from './building.class';

// enum ORIENTATION {
//   LONGITUDE = -1, // within a row
//   LATITUDE = 1, // within a column
// }

export type TileCoords = { row: number; col: number; }
export type Region = { nw: TileCoords; se: TileCoords; }

export function compareCoordinates(a: TileCoords | null, b: TileCoords | null): boolean {
  return not(a) ? not(b) : exists(b) && a.row === b.row && a.col === b.col;
}

export function compareRegions(a: Region | null, b: Region | null): boolean {
  return not(a) ? not(b) : exists(b) && compareCoordinates(a.nw, b.nw) && compareCoordinates(a.se, b.se);
}

type Tile = {
  building: Building | null;
}

export class Grid {

  readonly buildings: Building[] = [];
  private tiles: Tile[][] = [];

  public bounds: Region;

  public get width(): number {
    return this.bounds.se.col - this.bounds.nw.col + 1;
  }

  public get height(): number {
    return this.bounds.se.row - this.bounds.nw.row + 1;
  }

  constructor() {
    this.resizeGrid();
  }

  public isFree(region: Region): boolean {
    return this.tilesOf(region).every(t => !t.building);
  }

  public isFreeForRoad(region: Region): boolean {
    return this.tilesOf(region).every(t => !t.building || t.building.type === TYPE_ROAD);
  }

  public place(building: Building, region: Region): void {
    if (this.isFree(region)) {
      building.moveTo(region);
      this.buildings.push(building);
      this.tilesOf(building.region).forEach(t => t.building = building);
      this.resizeGrid();
    }
  }

  private resizeGrid(): void {
    if (!this.buildings.length) {
      this.bounds = { nw: { col: 0, row: 0 }, se: { col: -1, row: -1 } };
      this.tiles = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => ({ building: null })));
      return;
    }

    const bounds = this.buildings.reduce((
      { nw: { col: nwX1, row: nwY1 }, se: { col: seX1, row: seY1 } },
      { region: { nw: { col: nwX2, row: nwY2 }, se: { col: seX2, row: seY2 } } },
    ) => ({
      nw: { col: Math.min(nwX1, nwX2), row: Math.min(nwY1, nwY2) }, se: { col: Math.max(seX1, seX2), row: Math.max(seY1, seY2) },
    }), { nw: { col: Infinity, row: Infinity }, se: { col: -Infinity, row: -Infinity } } as Region);

    if (!compareRegions(bounds, this.bounds)) {
      this.bounds = bounds;
      // create new grid
      this.tiles = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => ({ building: null })));

      // place buildings on new grid
      this.buildings.forEach(b => this.tilesOf(b.region).forEach(t => t.building = b));
    }
  }

  // // Returns list of tiles w/ shortest path prioritising travel along a certain ORIENTATION, empty list if impossible
  // public planRoad(from: TileCoords, to: TileCoords, orientation: ORIENTATION = ORIENTATION.LATITUDE): LocatedTile[] {
  //   type T = { tile: Tile, at: TileCoords, beeline: number, prev?: T, dir?: ORIENTATION }; // `beeline` is distance from destination, as the crow flies
  //
  //   const tiles: T[][] = this.tiles
  //     .map((r, row) => r.map((tile, col) => ({ tile, at: { row, col }, beeline: Math.abs(to.row - row) + Math.abs(to.col - col) })));
  //
  //   const { height, width } = this;
  //   function getNeighbours(t: T): T[] {
  //     return [
  //       { row: t.at.row, col: t.at.col - 1, dir: ORIENTATION.LONGITUDE },
  //       { row: t.at.row, col: t.at.col + 1, dir: ORIENTATION.LONGITUDE },
  //       { row: t.at.row - 1, col: t.at.col, dir: ORIENTATION.LATITUDE },
  //       { row: t.at.row + 1, col: t.at.col, dir: ORIENTATION.LATITUDE },
  //     ]
  //       .filter(v => v.row >= 0 && v.row < height && v.col >= 0 && v.col < width)
  //       .map<[{ dir: ORIENTATION }, T]>(v => [v, tiles[v.row][v.col]])
  //       .filter(([_, n]) => Grid.isRoadable(n.tile))
  //       .filter(([_, n]) => !n.prev)
  //       .map(([{ dir }, n]) => (n.dir = dir, n.prev = t, n)); // eslint-disable-line
  //   }
  //
  //   const origin = tiles[from.row][from.col];
  //   const nextShortest: T[] = [origin];
  //   let cur: T;
  //   do {
  //     cur = nextShortest.pop();
  //     nextShortest.push(...getNeighbours(cur));
  //     nextShortest.sort(({ beeline: d1, dir: dir1 }, { beeline: d2, dir: dir2 }) => d2 - d1 || (dir1 - dir2) * orientation);
  //   } while (nextShortest.length > 0 && cur.beeline > 0);
  //
  //   if (cur.beeline === 0) {
  //     const res: LocatedTile[] = [];
  //     while (cur !== origin) {
  //       res.push(cur);
  //       cur = cur.prev;
  //     }
  //
  //     return res.concat(cur);
  //   }
  //
  //   return [];
  // }
  //
  // // Distinction between 'from' and 'to' matters, for the algorithm will prefer LATITUDE-first travelling
  // public placeRoad(from: TileCoords, to: TileCoords): void {
  //   const a = this.planRoad(from, to, ORIENTATION.LATITUDE);
  //   const b = this.planRoad(from, to, ORIENTATION.LONGITUDE);
  //   (b.length < a.length ? b : a)
  //     .filter(({ tile: { building } }) => !building)
  //     .forEach(({ at }) => this.place(new Building(TYPE_ROAD, BUILDING_ROAD), { nw: at, se: at }));
  // }

  public destroy(building: Building): void {
    this.tilesOf(building.region).forEach(t => t.building = null);
    this.buildings.splice(this.buildings.indexOf(building), 1);
    this.resizeGrid();
  }

  public buildingAt(at: TileCoords): Building | null {
    const localAt = this.translateCoords(at);
    return (this.tiles[localAt.row] && this.tiles[localAt.row][localAt.col] ?.building) || null;
  }

  private translateCoords({ col, row }: TileCoords): TileCoords {
    return { col: col - this.bounds.nw.col, row: row - this.bounds.nw.row };
  }

  private translate({ nw, se }: Region): Region {
    return { nw: this.translateCoords(nw), se: this.translateCoords(se) };
  }

  private tilesOf(region: Region): Tile[] {
    const { nw, se } = this.translate(region);
    return [].concat(...this.tiles
      .filter((_, r) => r >= nw.row && r <= se.row)
      .map((row => row.filter((_, c) => c >= nw.col && c <= se.col))));
  }

  // // Is `true` if the tile is building-free OR already is a road
  // private static isRoadable(tile: Tile): boolean {
  //   return !tile.building || (tile.building.parent === BUILDING_ROAD);
  // }

}
