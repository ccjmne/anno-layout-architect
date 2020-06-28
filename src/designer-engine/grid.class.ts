import { color } from 'd3-color';

import { Tile } from './tile.class';
import { Building, BUILDING_ROAD } from './building.class';
import { Coordinates } from './coordinates.class';
import { Region } from './region.class';
import { TYPE_ROAD } from './building-type.class';

enum ORIENTATION {
  LONGITUDE = -1,
  LATITUDE = 1,
}

type LocatedTile = { tile: Tile, at: Coordinates };

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
      .map(row => row.split(/(?<=.)/).map(char => new Tile(char !== '.' && new Building({ name: char, colour: color('grey') }))));
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

  public place(building: Building, region: Region): void {
    if (this.isFree(region)) {
      building.placeOn(region, this.tilesIn(Grid.normaliseCoordinates(region)));
      this.buildings.push(building);
    }
  }

  // Returns list of tiles w/ shortest path prioritising a certain ORIENTATION, empty list if impossible
  public planRoad(from: Coordinates, to: Coordinates, directionPreference: ORIENTATION = ORIENTATION.LATITUDE): LocatedTile[] {
    type T = { tile: Tile, at: Coordinates, beeline: number, prev?: T, dir?: ORIENTATION }; // `beeline` is distance from destination, as the crow flies

    const tiles: T[][] = this.tiles
      .map((r, row) => r.map((tile, col) => ({ tile, at: { row, col }, beeline: Math.abs(to.row - row) + Math.abs(to.col - col) })));

    const self = this;
    function getNeighbours(t: T): T[] {
      return [
        { row: t.at.row, col: t.at.col - 1, dir: ORIENTATION.LONGITUDE },
        { row: t.at.row, col: t.at.col + 1, dir: ORIENTATION.LONGITUDE },
        { row: t.at.row - 1, col: t.at.col, dir: ORIENTATION.LATITUDE },
        { row: t.at.row + 1, col: t.at.col, dir: ORIENTATION.LATITUDE },
      ]
        .filter(v => v.row >= 0 && v.row < self.height && v.col >= 0 && v.col < self.width)
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
      nextShortest.sort(({ beeline: d1, dir: dir1 }, { beeline: d2, dir: dir2 }) => d2 - d1 || (dir1 - dir2) * directionPreference); // LONGITUDE-first
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

  public placeRoad(from: Coordinates, to: Coordinates): void {
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

  public buildingAt({ row, col }: Coordinates): Building | null {
    return this.tiles[row][col].building;
  }

  private tilesIn({ nw, se }: Region): Tile[] {
    return [].concat(...this.tiles
      .filter((_, r) => r >= nw.row && r <= se.row)
      .map((row => row.filter((_, c) => c >= nw.col && c <= se.col))));
  }

  // in case NortWest and SouthEast coordinates are supplied wonkily.
  private static normaliseCoordinates({ nw: { row: r1, col: c1 }, se: { row: r2, col: c2 } }: Region): Region {
    return { nw: { row: Math.min(r1, r2), col: Math.min(c1, c2) }, se: { row: Math.max(r1, r2), col: Math.max(c1, c2) } };
  }

  // true if free OR road
  private static isRoadable(tile: Tile): boolean {
    return !tile.building || (tile.building.parent === BUILDING_ROAD);
  }

}
