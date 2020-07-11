import { Observable } from 'rxjs/internal/Observable';
import { ReplaySubject } from 'rxjs/internal/ReplaySubject';
import { Subject } from 'rxjs/internal/Subject';
import { combineLatest } from 'rxjs/internal/observable/combineLatest';
import { merge } from 'rxjs/internal/observable/merge';
import { debounceTime } from 'rxjs/internal/operators/debounceTime';
import { distinctUntilChanged } from 'rxjs/internal/operators/distinctUntilChanged';
import { filter } from 'rxjs/internal/operators/filter';
import { first } from 'rxjs/internal/operators/first';
import { mapTo } from 'rxjs/internal/operators/mapTo';
import { startWith } from 'rxjs/internal/operators/startWith';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { tap } from 'rxjs/internal/operators/tap';

import { OrthogonalPath } from 'src/coordinates-system/orthogonal-path';
import { Region, TileCoords } from 'src/designer-engine/definitions';
import { mod } from 'src/utils/maths';

import { computeGeometry, Geometry, Point } from './definitions';

const DEBOUNCE_ACTIVITY = 1000;
const TILES_PADDING = 10;

export class CoordinatesSystem {

  public readonly systemUpdate$: Observable<void>;

  public tileSide: number;
  public background: Geometry;

  private readonly containerSize$: Subject<{ offsetWidth: number, offsetHeight: number }> = new Subject();
  private readonly gridBounds$: Subject<Region> = new Subject();
  private readonly recentActivity$: Subject<boolean> = new Subject();
  private propagateUpdate$: Observable<boolean>;

  private localOffset: { x: number, y: number } = { x: 0, y: 0 }; // TODO: maybe doesn't need initialising?

  public constructor() {
    merge(
      this.recentActivity$,
      this.recentActivity$.pipe(filter(busy => busy), debounceTime(DEBOUNCE_ACTIVITY), mapTo(false)),
    ).pipe(
      startWith(false),
      distinctUntilChanged(),
    ).subscribe(this.propagateUpdate$ = new ReplaySubject(1));

    combineLatest([
      this.containerSize$.pipe(debounceTime(50)),
      this.gridBounds$.pipe(switchMap(data => this.propagateUpdate$.pipe(filter(busy => !busy), first(), mapTo(data)))),
    ]).pipe(
      tap(([{ offsetWidth, offsetHeight }, bounds]) => {
        const cols = bounds.se.col - bounds.nw.col + TILES_PADDING * 2;
        const rows = bounds.se.row - bounds.nw.row + TILES_PADDING * 2;
        this.tileSide = Math.min(Math.floor(offsetWidth / cols), Math.floor(offsetHeight / rows));

        const { x, y, w, h, cx, cy } = this.computeGeometry(bounds);
        this.localOffset = {
          x: +(w - offsetWidth) / 2 + x[0],
          y: +(h - offsetHeight) / 2 + y[0],
        };

        // 1px padding to each side
        const bgW = offsetWidth + 2;
        const bgH = offsetHeight + 2;
        this.background = {
          x: [-bgW / 2 + cx, bgW / 2 + cx],
          y: [-bgH / 2 + cy, bgH / 2 + cy],
          w: bgW,
          h: bgH,
          cols,
          rows,
          cx,
          cy,
        };
      }),
      // TODO: takeUntil? This needs unsubscribing.
    ).subscribe(this.systemUpdate$ = new ReplaySubject(1));
  }

  public toTileCoords({ x, y }: Point): TileCoords {
    return { row: Math.floor(y / this.tileSide), col: Math.floor(x / this.tileSide) };
  }

  public toLocalCoords({ offsetX, offsetY }: MouseEvent): Point {
    return { x: this.localOffset.x + offsetX, y: this.localOffset.y + offsetY };
  }

  public computeGeometry(region: Region): Geometry {
    return computeGeometry(region, this.tileSide);
  }

  public computeOrthogonalGeometry(region: Region, path: OrthogonalPath): Geometry {
    return { ...this.computeGeometry(region), d: path.compute(this.tileSide) };
  }

  public snapToGrid({ x, y }: Point, { w, h }: { w: number, h: number }): Region {
    const idealNW: Point = { x: x - (w / 2) * this.tileSide, y: y - (h / 2) * this.tileSide };
    const { col, row }: TileCoords = {
      col: Math.floor(idealNW.x / this.tileSide) + +(mod(idealNW.x, this.tileSide) > this.tileSide / 2),
      row: Math.floor(idealNW.y / this.tileSide) + +(mod(idealNW.y, this.tileSide) > this.tileSide / 2),
    };

    return { nw: { col, row }, se: { col: col + w - 1, row: row + h - 1 } };
  }

  // Call this method to bypass activity debounce
  public updateNow(): void {
    this.recentActivity$.next(false);
  }

  public notifyActivity(): void {
    this.recentActivity$.next(true);
  }

  public updateGridBounds(region: Region): void {
    this.gridBounds$.next(region);
  }

  public updateContainerSize(size: { offsetWidth: number, offsetHeight: number }): void {
    this.containerSize$.next(size);
  }

}
