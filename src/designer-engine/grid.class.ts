import { exists, not } from 'src/utils/nullable';

import { TYPE_ROAD } from './building-type.class';
import { Building, BUILDING_ROAD } from './building.class';
import { Tile } from './tile.class';

enum ORIENTATION {
  LONGITUDE = -1, // within a row
  LATITUDE = 1, // within a column
}

export type TileCoords = { row: number; col: number; }
export type Region = { nw: TileCoords; se: TileCoords; }

type LocatedTile = { tile: Tile, at: TileCoords };

export function compareCoordinates(a: TileCoords | null, b: TileCoords | null): boolean {
  return (not(a) ? not(b) : exists(b) && a.row === b.row && a.col === b.col);
}

export function compareRegions(a: Region | null, b: Region | null): boolean {
  return (not(a) ? not(b) : exists(b) && compareCoordinates(a.nw, b.nw) && compareCoordinates(a.se, b.se));
}

export class Grid {

  private tiles!: Tile[][];
  readonly buildings: Building[] = [];

  public readonly width!: number; // TODO: only getter should be public
  public readonly height!: number; // TODO: only getter should be public

  constructor(txt: string = `
    ............
    ............
    ............
    ............
    ............
    ............
    ............
    ............
    ............
    ............
  `) {
    this.tiles = txt
      .split(/\n/)
      .map(row => row.trim())
      .filter(row => row.length > 0)
      .map(row => row.split(/(?<=.)/).map(() => new Tile(null)));
    this.width = this.tiles[0].length;
    this.height = this.tiles.length;
  }

  public print(): void {
    console.log({ width: this.width, height: this.height });
    console.log(this.tiles.map(row => row.map(t => (t.building ? t.building.type.name : '.').padEnd(3)).join('')).join('\n'));
  }

  public isFree(region: Region): boolean {
    return this.tilesIn(Grid.normaliseCoordinates(region)).every(t => !t.building);
  }

  public isFreeForRoad(region: Region): boolean {
    return this.tilesIn(Grid.normaliseCoordinates(region)).every(t => !t.building || t.building.type === TYPE_ROAD);
  }

  public place(building: Building, region: Region): void {
    if (this.isFree(region)) {
      building.placeOn(region, this.tilesIn(Grid.normaliseCoordinates(region)));
      this.buildings.push(building);
    }
  }

  // Returns list of tiles w/ shortest path prioritising travel along a certain ORIENTATION, empty list if impossible
  public planRoad(from: TileCoords, to: TileCoords, orientation: ORIENTATION = ORIENTATION.LATITUDE): LocatedTile[] {
    type T = { tile: Tile, at: TileCoords, beeline: number, prev?: T, dir?: ORIENTATION }; // `beeline` is distance from destination, as the crow flies

    const tiles: T[][] = this.tiles
      .map((r, row) => r.map((tile, col) => ({ tile, at: { row, col }, beeline: Math.abs(to.row - row) + Math.abs(to.col - col) })));

    const { height, width } = this;
    function getNeighbours(t: T): T[] {
      return [
        { row: t.at.row, col: t.at.col - 1, dir: ORIENTATION.LONGITUDE },
        { row: t.at.row, col: t.at.col + 1, dir: ORIENTATION.LONGITUDE },
        { row: t.at.row - 1, col: t.at.col, dir: ORIENTATION.LATITUDE },
        { row: t.at.row + 1, col: t.at.col, dir: ORIENTATION.LATITUDE },
      ]
        .filter(v => v.row >= 0 && v.row < height && v.col >= 0 && v.col < width)
        .map<[{ dir: ORIENTATION }, T]>(v => [v, tiles[v.row][v.col]])
        .filter(([_, n]) => Grid.isRoadable(n.tile))
        .filter(([_, n]) => !n.prev)
        .map(([{ dir }, n]) => (n.dir = dir, n.prev = t, n)); // eslint-disable-line
    }

    const origin = tiles[from.row][from.col];
    const nextShortest: T[] = [origin];
    let cur: T;
    do {
      cur = nextShortest.pop();
      nextShortest.push(...getNeighbours(cur));
      nextShortest.sort(({ beeline: d1, dir: dir1 }, { beeline: d2, dir: dir2 }) => d2 - d1 || (dir1 - dir2) * orientation);
    } while (nextShortest.length > 0 && cur.beeline > 0);

    if (cur.beeline === 0) {
      const res: LocatedTile[] = [];
      while (cur !== origin) {
        res.push(cur);
        cur = cur.prev;
      }

      return res.concat(cur);
    }

    return [];
  }

  // Distinction between 'from' and 'to' matters, for the algorithm will prefer LATITUDE-first travelling
  public placeRoad(from: TileCoords, to: TileCoords): void {
    const a = this.planRoad(from, to, ORIENTATION.LATITUDE);
    const b = this.planRoad(from, to, ORIENTATION.LONGITUDE);
    (b.length < a.length ? b : a).filter(({ tile: { building } }) => !building).forEach(({ tile, at }) => {
      const road = new Building(TYPE_ROAD, BUILDING_ROAD);
      road.placeOn({ nw: at, se: at }, [tile]);
      this.buildings.push(road);
    });
  }

  public destroy(building: Building): void {
    building.removeFrom(this);
  }

  public buildingAt(at: TileCoords | null): Building | null {
    return at ? this.tiles[at.row][at.col].building : null;
  }

  private tilesIn({ nw, se }: Region): Tile[] {
    return [].concat(...this.tiles
      .filter((_, r) => r >= nw.row && r <= se.row)
      .map((row => row.filter((_, c) => c >= nw.col && c <= se.col))));
  }

  // In case North-West and South-East coordinates are supplied wonkily
  private static normaliseCoordinates({ nw: { row: r1, col: c1 }, se: { row: r2, col: c2 } }: Region): Region {
    return { nw: { row: Math.min(r1, r2), col: Math.min(c1, c2) }, se: { row: Math.max(r1, r2), col: Math.max(c1, c2) } };
  }

  // Is `true` if the tile is building-free OR already is a road
  private static isRoadable(tile: Tile): boolean {
    return !tile.building || (tile.building.parent === BUILDING_ROAD);
  }

}
