import { ReplaySubject, Subject } from 'rxjs';

import { ENCODER_DECODER_V0 } from 'src/encode-decode/encoder-decoder-v0.class';

import { Building, BuildingType } from './building.class';
import { Region, compareRegions, TileCoords, ORIENTATION, computeRegion, overlaps } from './definitions';

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

    this.buildings.add(new Building(type, at, orientation));
    this.resizeGrid();
  }

  public move(building: Building, to: TileCoords, orientation: ORIENTATION): void {
    const region: Region = computeRegion(building.type, to, orientation);
    if (!this.isFree(region, { ignore: building })) {
      throw new Error(`Cannot place building of type ${building.type.name} at ${JSON.stringify(region, null, 2)}`);
    }

    building.move(to, orientation);
    this.buildings.add(building);
    this.resizeGrid();
  }

  public remove(building: Building): void {
    [...building.children, building].forEach(b => this.buildings.delete(b));
    this.resizeGrid();
  }

  public getCode(this: Grid): string {
    return ENCODER_DECODER_V0.encode([...this.buildings]
      .map(({ type, region: { nw }, orientation, parent }) => new Building(type, this.normaliseCoords(nw), orientation, parent)));
  }

  public fromCode(code: string): void {
    this.buildings.clear();
    // TODO: this may trigger lots of redraws; just bulk-add buildings rather
    ENCODER_DECODER_V0.decode(code).forEach(({ type, region: { nw }, orientation }) => this.place(type, nw, orientation));
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

  // Translates points to a system where all coords are >= 0
  private normaliseCoords({ col, row }: TileCoords): TileCoords {
    return { col: col - this.bounds.nw.col, row: row - this.bounds.nw.row };
  }

}
