import { Subject } from 'rxjs/internal/Subject';

import { combineLatest } from 'rxjs/internal/observable/combineLatest';

import { Region, TileCoords } from 'src/designer-engine/definitions';

const TILES_PADDING = 4;

export type LocalCoords = { x: number, y: number };
export type Geometry = { x: [number, number], y: [number, number], w: number, h: number, cx: number, cy: number };
export type Geometrised<Datum> = Datum & { geo: Geometry };

export class CoordinatesSystem {

  public tileSide: number;
  public background: Geometry;

  private readonly containerSize$: Subject<{ offsetWidth: number, offsetHeight: number }> = new Subject();
  private readonly gridBounds$: Subject<Region> = new Subject();

    private localOffset: { x: number, y: number } = { x: 0, y: 0 }; // TODO: maybe doesn't need initialising?

    public constructor() {
      combineLatest([
        this.containerSize$,
        this.gridBounds$,
      ]).pipe(
        // TODO: takeUntil? This needs unsubscribing.
      ).subscribe(([{ offsetWidth, offsetHeight }, bounds]) => {
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
          w: bgW,
          h: bgH,
          cx,
          cy,
          x: [-bgW / 2 + cx, bgW / 2 + cx],
          y: [-bgH / 2 + cy, bgH / 2 + cy],
        };
      });
    }

    public toTileCoords({ x, y }: LocalCoords): TileCoords {
      return { row: Math.floor(y / this.tileSide), col: Math.floor(x / this.tileSide) };
    }

    public toLocalCoords({ offsetX, offsetY }: MouseEvent): LocalCoords {
      return { x: this.localOffset.x + offsetX, y: this.localOffset.y + offsetY };
    }

    public computeGeometry({ nw, se }: Region): Geometry {
      return {
        w: (se.col - nw.col + 1) * this.tileSide,
        h: (se.row - nw.row + 1) * this.tileSide,
        cx: (se.col + nw.col + 1) * (this.tileSide / 2),
        cy: (se.row + nw.row + 1) * (this.tileSide / 2),
        x: [nw.col * this.tileSide, (se.col + 1) * this.tileSide],
        y: [nw.row * this.tileSide, (se.row + 1) * this.tileSide],
      };
    }

    public updateGridBounds(region: Region): void {
      this.gridBounds$.next(region);
    }

    public updateContainerSize(size: {offsetWidth: number, offsetHeight: number}): void {
      this.containerSize$.next(size);
    }

}
