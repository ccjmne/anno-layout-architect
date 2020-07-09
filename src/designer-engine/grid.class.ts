import { ReplaySubject, Subject } from 'rxjs';

import { Building, BuildingType, BUILDING_TYPES } from './building.class';
import { Region, compareRegions, TileCoords, ORIENTATION, computeRegion, overlaps } from './definitions';
import { encode, EXPORT_FORMAT_VERSION, TYPE_AND_COUNT, COORDS_AND_ORIENTATION, decode, TYPE_BUILDINGS_CHUNKSIZE } from './import-export';

const EMPTY_BOUNDS: Region = { nw: { row: 0, col: 0 }, se: { row: -1, col: -1 } };

export class Grid {

  // Should be a BehaviorSubject, but can't due to a current bug in rxjs
  // See https://github.com/ReactiveX/rxjs/issues/5105
  public bounds: Region;

  public get width(): number { return this.bounds.se.col - this.bounds.nw.col + 1; }
  public get height(): number { return this.bounds.se.row - this.bounds.nw.row + 1; }
  public readonly boundsChanged$: Subject<Region> = new ReplaySubject();
  public readonly buildings: Set<Building> = new Set();

  constructor() {
    this.resizeGrid();
  }

  public buildingAt(at: TileCoords): Building | null {
    return this.buildingsIn({ nw: at, se: at }, []).values().next().value;
  }

  public buildingsIn(region: Region, ignore: BuildingType[], ignoreSpecific?: Building): Set<Building> {
    return new Set([...this.buildings]
      .filter(b => b && b !== ignoreSpecific && !ignore.includes(b.type))
      .filter(({ region: r }) => overlaps(region, r)));
  }

  /**
   * Check whether the region is free of any buildings.
   * @param  opts   If opts.road is truthy, the region may contain road tiles.
   *                Use opts.ignore to allow moving a building.
   * @return        `true` if the region is building-free.
   */
  public isFree(region: Region, opts?: { road?: boolean, ignore?: Building }): boolean {
    // TODO: add mechanism for road-ish types
    return this.buildingsIn(region, (opts ?.road ? [/* here */] : []), opts ?.ignore).size === 0;
  }

  public place(type: BuildingType, at: TileCoords, orientation: ORIENTATION): void {
    const region = computeRegion(type, at, orientation);
    if (!this.isFree(region)) {
      throw new Error(`Cannot place building of type ${type.name} at ${JSON.stringify(region, null, 2)}`);
    }

    const building = new Building(type);
    building.moveTo(region);
    this.buildings.add(building);
    this.resizeGrid();
  }

  public move(building: Building, at: TileCoords, orientation: ORIENTATION): void {
    const region: Region = computeRegion(building.type, at, orientation);
    if (!this.isFree(region, { ignore: building })) {
      throw new Error(`Cannot place building of type ${building.type.name} at ${JSON.stringify(region, null, 2)}`);
    }

    building.moveTo(region);
    this.buildings.add(building);
    this.resizeGrid();
  }

  public remove(building: Building): void {
    [...building.children, building].forEach(b => this.buildings.delete(b));
    this.resizeGrid();
  }

  public getCode(this: Grid): string {
    let res = encode(EXPORT_FORMAT_VERSION, 1);
    Object.entries(this.buildingsByType())
      .map(([type, buildings]) => ({ type: parseInt(type, 10), buildings }))
      .forEach(({ type, buildings }) => {
        while (buildings.length) {
          res += TYPE_AND_COUNT.encode({ type, count: Math.min(buildings.length, TYPE_BUILDINGS_CHUNKSIZE) });
          res += buildings.splice(0, TYPE_BUILDINGS_CHUNKSIZE)
            .map(({ region: { nw }, orientation }) => COORDS_AND_ORIENTATION.encode({ ...this.normaliseCoords(nw), orientation })).join('');
        }
      });

    return res;
  }

  public fromCode(code: string): void {
    let s = code;
    function consume(chars: number): string {
      const res = s.slice(0, chars);
      s = s.slice(chars);
      return res;
    }

    if (decode(consume(1)) !== EXPORT_FORMAT_VERSION) {
      throw new Error(`Can't decode code '${code}' with import/export v${EXPORT_FORMAT_VERSION}`);
    }

    this.buildings.clear();
    while (s.length) {
      const { type: id, count } = TYPE_AND_COUNT.decode(consume(2));
      const type = BUILDING_TYPES.find(t => t.id === id);
      Array.from({ length: count + 1 }, () => COORDS_AND_ORIENTATION.decode(consume(3)))
        .forEach(({ col, row, orientation }) => this.place(type, { col, row }, orientation));
    }
  }

  private resizeGrid(): void {
    if (!this.buildings.size) {
      this.boundsChanged$.next(this.bounds = EMPTY_BOUNDS);
      return;
    }

    const bounds = [...this.buildings.values()].reduce((
      { nw: { col: nwX1, row: nwY1 }, se: { col: seX1, row: seY1 } },
      { region: { nw: { col: nwX2, row: nwY2 }, se: { col: seX2, row: seY2 } } },
    ) => ({
      nw: { col: Math.min(nwX1, nwX2), row: Math.min(nwY1, nwY2) }, se: { col: Math.max(seX1, seX2), row: Math.max(seY1, seY2) },
    }), { nw: { col: Infinity, row: Infinity }, se: { col: -Infinity, row: -Infinity } } as Region);

    if (!compareRegions(bounds, this.bounds)) {
      this.boundsChanged$.next(this.bounds = bounds);
    }
  }

  private normaliseCoords({ col, row }: TileCoords): TileCoords {
    return { col: col - this.bounds.nw.col, row: row - this.bounds.nw.row };
  }

  private buildingsByType(): Record<number, Building[]> {
    return [...this.buildings].reduce((acc, b) => ({ ...acc, [b.type.id]: (acc[b.type.id] || []).concat(b) }), {});
  }

}
