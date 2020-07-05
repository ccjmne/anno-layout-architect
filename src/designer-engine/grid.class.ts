import { ReplaySubject, Subject } from 'rxjs';

import { Building, TYPE_ROAD, BuildingType } from './building.class';
import { Region, compareRegions, TileCoords } from './definitions';

// enum ORIENTATION {
//   LONGITUDE = -1, // within a row
//   LATITUDE = 1, // within a column
// }

const EMPTY_BOUNDS: Region = { nw: { row: 0, col: 0 }, se: { row: -1, col: -1 } };

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

  // Should be a BehaviorSubject, but can't due to a current bug in rxjs
  // See https://github.com/ReactiveX/rxjs/issues/5105
  public bounds: Region;

  public get width(): number { return this.bounds.se.col - this.bounds.nw.col + 1; }
  public get height(): number { return this.bounds.se.row - this.bounds.nw.row + 1; }
  public readonly boundsChanged$: Subject<void> = new ReplaySubject();
  public readonly buildings: Set<Building> = new Set();

  private tiles: Tile[][] = [];

  constructor() {
    this.resizeGrid();
  }

  public buildingAt(at: TileCoords): Building | null {
    const internalAt = this.translateToInternalCoords(at);
    return this.tiles[internalAt.row] && this.tiles[internalAt.row][internalAt.col] ?.building;
  }

  public buildingsIn(region: Region, ignore: BuildingType[], ignoreSpecific?: Building): Set<Building> {
    return new Set(
      this.tilesIn(region).map(({ building }) => building).filter(b => b && b !== ignoreSpecific && !ignore.includes(b.type)),
    );
  }

  /**
   * Check whether the region is free of any buildings.
   * @param  opts   If opts.road is truthy, the region may contain road tiles.
   *                Use opts.ignore to allow moving a building.
   * @return        `true` if the region is building-free.
   */
  public isFree(region: Region, opts?: { road?: boolean, ignore?: Building }): boolean {
    return this.buildingsIn(region, (opts?.road ? [TYPE_ROAD] : []), opts?.ignore).size === 0;
  }

  public place(building: Building, region: Region): void {
    if (this.isFree(region, { ignore: building })) {
      if (building.region) {
        this.tilesIn(building.region).forEach(t => t.unlink()); // mini-remove that preserves children
      }

      building.moveTo(region);
      this.buildings.add(building);
      this.tilesIn(building.region).forEach(t => t.link(building));
      this.resizeGrid();
    }
  }

  public remove(building: Building): void {
    [...building.children, building].forEach(b => {
      this.tilesIn(b.region).forEach(t => t.unlink());
      this.buildings.delete(b);
    });

    this.resizeGrid();
  }

  private resizeGrid(): void {
    if (!this.buildings.size) {
      this.bounds = EMPTY_BOUNDS;
      this.boundsChanged$.next();
      this.tiles = [];
      return;
    }

    const bounds = [...this.buildings.values()].reduce((
      { nw: { col: nwX1, row: nwY1 }, se: { col: seX1, row: seY1 } },
      { region: { nw: { col: nwX2, row: nwY2 }, se: { col: seX2, row: seY2 } } },
    ) => ({
      nw: { col: Math.min(nwX1, nwX2), row: Math.min(nwY1, nwY2) }, se: { col: Math.max(seX1, seX2), row: Math.max(seY1, seY2) },
    }), { nw: { col: Infinity, row: Infinity }, se: { col: -Infinity, row: -Infinity } } as Region);

    if (!compareRegions(bounds, this.bounds)) {
      this.bounds = bounds;
      this.boundsChanged$.next();

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
