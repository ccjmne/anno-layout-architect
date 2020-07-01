import { Building, TYPE_ROAD, BuildingType } from './building.class';
import { Region, compareRegions, TileCoords } from './definitions';

// enum ORIENTATION {
//   LONGITUDE = -1, // within a row
//   LATITUDE = 1, // within a column
// }

class Tile {

  public building: Building | null;
  public link(building: Building): void {
    this.building = building;
  }

  public unlink(): void {
    this.building = null;
  }

}

export class Grid {

  public readonly buildings: Building[] = [];
  public bounds: Region;
  public get width(): number { return this.bounds.se.col - this.bounds.nw.col + 1; } // TODO: DELETE
  public get height(): number { return this.bounds.se.row - this.bounds.nw.row + 1; } // TODO: DELETE

  private tiles: Tile[][] = [];

  constructor() {
    this.resizeGrid();
  }

  public buildingAt(at: TileCoords): Building | null {
    const localAt = this.translateToInternalCoords(at);
    return this.tiles[localAt.row] && this.tiles[localAt.row][localAt.col] ?.building;
  }

  public buildingsIn(region?: Region, ...ignore: BuildingType[]): Set<Building> {
    if (!region) {
      return new Set(this.buildings.filter(({ type }) => !ignore.includes(type)));
    }

    return new Set(
      this.tilesIn(region).filter(({ building }) => building && !ignore.includes(building.type)).map(({ building }) => building),
    );
  }

  /**
   * Check whether the region is free of any buildings.
   * @param  opts   If opts.road is truthy, the region may contain road tiles
   * @return        `true` if the region is building-free.
   */
  public isFree(region: Region, opts?: { road?: boolean }): boolean {
    return this.buildingsIn(region, ...(opts?.road ? [TYPE_ROAD] : [])).size === 0;
  }

  public place(building: Building, region: Region): void {
    if (this.isFree(region)) {
      building.moveTo(region);
      this.buildings.push(building);
      this.tilesIn(building.region).forEach(t => t.link(building));
      this.resizeGrid();
    }
  }

  public remove(building: Building): void {
    this.tilesIn(building.region).forEach(t => t.unlink());
    this.buildings.splice(this.buildings.indexOf(building), 1);
    this.resizeGrid();
  }

  private resizeGrid(): void {
    if (!this.buildings.length) {
      this.bounds = { nw: { col: 0, row: 0 }, se: { col: -1, row: -1 } };
      this.tiles = [];
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
      this.tiles = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => new Tile()));

      // place buildings on new grid
      this.buildings.forEach(b => this.tilesIn(b.region).forEach(t => t.link(b)));
    }
  }
  //
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

  private translateToInternalCoords({ col, row }: TileCoords): TileCoords {
    return { col: col - this.bounds.nw.col, row: row - this.bounds.nw.row };
  }

  private translateToInternal({ nw, se }: Region): Region {
    return { nw: this.translateToInternalCoords(nw), se: this.translateToInternalCoords(se) };
  }

  private tilesIn(region: Region): Tile[] {
    const { nw, se } = this.translateToInternal(region);
    return [].concat(...this.tiles
      .filter((_, r) => r >= nw.row && r <= se.row)
      .map((row => row.filter((_, c) => c >= nw.col && c <= se.col))));
  }

}
