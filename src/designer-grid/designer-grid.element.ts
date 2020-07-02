import { range } from 'd3-array';
import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { hsl } from 'd3-color';
import { scaleLinear, scaleBand } from 'd3-scale';
import { select, Selection, local } from 'd3-selection';

import { ReplaySubject } from 'rxjs/internal/ReplaySubject';
import { combineLatest } from 'rxjs/internal/observable/combineLatest';
import { fromEvent } from 'rxjs/internal/observable/fromEvent';
import { merge } from 'rxjs/internal/observable/merge';
import { debounceTime } from 'rxjs/internal/operators/debounceTime';
import { distinctUntilChanged } from 'rxjs/internal/operators/distinctUntilChanged';
import { map } from 'rxjs/internal/operators/map';

import { startWith } from 'rxjs/internal/operators/startWith';

import { tap, mapTo } from 'rxjs/operators';

import { Building, BuildingType, TYPE_ROAD, TYPE_FARM } from 'src/designer-engine/building.class';
import { TileCoords, Region, compareCoordinates, compareRegions } from 'src/designer-engine/definitions';
import { Grid } from 'src/designer-engine/grid.class';
import { untilDisconnected } from 'src/utils/customelement-disconnected';
import { mod } from 'src/utils/maths';
import { not, exists } from 'src/utils/nullable';
import { snapTransition, opacityTransition, slowTransition, errorTransition, exitTransition, mergeTransforms, successTransition } from 'src/utils/transitions';

const TEXT_MEASUREMENTS = local<{ w: number, h: number }>();

enum ActionValidity { VALID, INVALID, UNAVAILABLE }
enum ActionType { INSPECT = 'INSPECT', BUILD = 'BUILD', DESTROY = 'DESTROY', COPY = 'COPY' } // string values are used in css

const TILES_PADDING: number = 4;
const SUBDIVISION_SIZE: number = 3;

export type CanvasCoords = { x: number, y: number };
export type Geometry = { x: [number, number], y: [number, number], w: number, h: number, cx: number, cy: number };
export type Geometrised<Datum> = Datum & { geo: Geometry };

type Action = { type: ActionType, validity: ActionValidity, region: Region | null };

function compareActions(a: Action | null, b: Action | null): boolean {
  return not(a) ? not(b) : exists(b) && a.type === b.type && a.validity === b.validity && compareRegions(a.region, b.region);
}

function computeLabels({ se, nw }: Region): { cols: string[], rows: string[]} {
  return {
    cols: range(0, se.col - nw.col + 1).map(String),
    rows: range(0, se.row - nw.row + 1).map(String),
  };
}

class DesignerGrid extends HTMLElement {

  // HTML elements
  private container: HTMLElement;
  private btnFarm: HTMLButtonElement;
  private btnRoad: HTMLButtonElement;
  private btnDestroy: HTMLButtonElement;
  private btnInspect: HTMLButtonElement;

  // D3 Selections
  private center: Selection<SVGGElement, unknown, null, undefined>;
  private zerozero: Selection<SVGGElement, unknown, null, undefined>;
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private buildings: Selection<SVGGElement, Geometrised<Building>, null, undefined>;
  private outline: Selection<SVGGElement, Geometrised<unknown>, null, undefined>;

  private axes: {
    top: Selection<SVGGElement, unknown, null, undefined>,
    right: Selection<SVGGElement, unknown, null, undefined>,
    bottom: Selection<SVGGElement, unknown, null, undefined>,
    left: Selection<SVGGElement, unknown, null, undefined>,
    rows: Selection<SVGGElement, unknown, null, undefined>,
    cols: Selection<SVGGElement, unknown, null, undefined>
  };

  private highlights: {
    row: Selection<SVGRectElement, number | null, null, undefined>,
    col: Selection<SVGRectElement, number | null, null, undefined>
  }

  // Engine model
  private grid: Grid = new Grid();
  private mode: ActionType = ActionType.INSPECT;
  private readonly build: { type: BuildingType, rotate: boolean } = { type: TYPE_ROAD, rotate: false };

  // These should be BehaviorSubjects, but can't due to a current bug in rxjs
  // See https://github.com/ReactiveX/rxjs/issues/5105
  private tileSide: number;
  private hovered: TileCoords | null;

  private mouseCoords$: ReplaySubject<CanvasCoords> = new ReplaySubject(1);
  private revalidateAction$: ReplaySubject<null> = new ReplaySubject(1);

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.grid.place(new Building(TYPE_FARM), { nw: { row: 1, col: 1 }, se: { row: 2, col: 3 } });
    this.grid.place(new Building(TYPE_FARM), { nw: { row: 7, col: 8 }, se: { row: 9, col: 9 } });
  }

  public connectedCallback(): void {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.append(document.createTextNode(require('./designer-grid.inline.scss')));
    this.shadowRoot.innerHTML += style.outerHTML + require('./designer-grid.template.html');

    this.container = this.shadowRoot.querySelector('main');
    this.svg = select(this.shadowRoot.querySelector('svg'));

    // TODO: temporary buttons
    this.btnFarm = this.shadowRoot.querySelector('button#farm');
    this.btnRoad = this.shadowRoot.querySelector('button#road');
    this.btnDestroy = this.shadowRoot.querySelector('button#destroy');
    this.btnInspect = this.shadowRoot.querySelector('button#inspect');
    this.btnFarm.addEventListener('click', () => (this.mode = ActionType.BUILD, this.build.type = TYPE_FARM));
    this.btnRoad.addEventListener('click', () => (this.mode = ActionType.BUILD, this.build.type = TYPE_ROAD));
    this.btnDestroy.addEventListener('click', () => this.mode = ActionType.DESTROY);
    this.btnInspect.addEventListener('click', () => this.mode = ActionType.INSPECT);
    this.shadowRoot.querySelector('button#dump').addEventListener('click', () => {
      console.log(this.grid.buildings);
    });

    this.center = this.svg.append('g').attr('class', 'center');
    this.zerozero = this.center.append('g').attr('class', 'zerozero');
    this.highlights = {
      row: this.zerozero.append('rect').datum<number | null>(null).attr('class', 'highlight'),
      col: this.zerozero.append('rect').datum<number | null>(null).attr('class', 'highlight'),
    };

    this.axes = {
      rows: this.zerozero.append('g').attr('class', 'axis rows'),
      cols: this.zerozero.append('g').attr('class', 'axis cols'),
      top: this.zerozero.append('g').attr('class', 'axis top'),
      right: this.zerozero.append('g').attr('class', 'axis right'),
      bottom: this.zerozero.append('g').attr('class', 'axis bottom'),
      left: this.zerozero.append('g').attr('class', 'axis left'),
    };

    this.buildings = this.zerozero.append('g').attr('class', 'buildings') as Selection<SVGGElement, Geometrised<Building>, any, any>;
    this.outline = this.zerozero.append<SVGGElement>('g').datum(null as Geometrised<unknown>).attr('class', 'outline');
    this.outline.append('rect').attr('class', 'region-outline');
    this.outline.append('path').attr('class', 'text-bg');
    this.outline.append('text')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'text-after-edge');

    merge(
      this.grid.boundsChanged$,
      fromEvent(window, 'resize').pipe(debounceTime(50)),
    ).pipe(
      untilDisconnected(this),
    ).subscribe(() => {
      this.tileSide = this.computeTileSide();
      this.redraw();
    });

    merge(
      fromEvent<MouseEvent>(this.container, 'mousemove'),
      fromEvent<MouseEvent>(this.container, 'mouseenter'),
    ).pipe(
      map(e => this.getCanvasCoords(e)),
      untilDisconnected(this),
    ).subscribe(this.mouseCoords$);

    merge(
      fromEvent<MouseEvent>(this.container, 'mouseleave').pipe(mapTo(null)),
      this.mouseCoords$.pipe(
        map(e => this.getTileCoords(e)),
        distinctUntilChanged(compareCoordinates),
      ),
    ).pipe(
      tap(at => this.hovered = at),
      untilDisconnected(this),
    ).subscribe(() => this.redrawHighlights());

    fromEvent<KeyboardEvent>(document, 'keypress').pipe(
      untilDisconnected(this),
    ).subscribe(({ key }) => {
      switch (key) {
        case '.':
        case ',':
        case 'q':
        case 'e':
          this.build.rotate = !this.build.rotate;
          break;
        case 'b':
          this.mode = ActionType.BUILD;
          break;
        case 'c':
          this.mode = ActionType.COPY;
          break;
        case 'd':
          this.mode = ActionType.DESTROY;
          break;
        case 's':
          this.mode = ActionType.BUILD;
          this.build.type = TYPE_ROAD;
          break;
        default: return;
      }

      this.revalidateAction$.next(null);
    });

    combineLatest([
      this.mouseCoords$,
      this.revalidateAction$.pipe(startWith(null)),
    ]).pipe(
      map(([e]) => this.validateAction(e)),
      distinctUntilChanged(compareActions),
      untilDisconnected(this),
    ).subscribe(action => this.feedbackAction(action));

    fromEvent<MouseEvent>(this.container, 'click').pipe(
      map(e => this.getCanvasCoords(e)),
      map(e => this.validateAction(e)),
      untilDisconnected(this),
    ).subscribe(action => this.executeAction(action));

    fromEvent<MouseEvent>(this.container, 'contextmenu').pipe(
      untilDisconnected(this),
    ).subscribe(e => {
      e.preventDefault();
      this.mode = ActionType.INSPECT;
      this.revalidateAction$.next(null);
    });
  }

  public disconnectedCallback(): void { }

  private validateAction(mouse: CanvasCoords | null): Action {
    if (this.mode === ActionType.BUILD) {
      const { width: w, height: h } = this.build.rotate
        ? { width: this.build.type.height, height: this.build.type.width }
        : this.build.type;
      const idealNW: CanvasCoords = { x: mouse.x - (w / 2) * this.tileSide, y: mouse.y - (h / 2) * this.tileSide };
      const { col, row }: TileCoords = {
        col: Math.floor(idealNW.x / this.tileSide) + +(mod(idealNW.x, this.tileSide) > this.tileSide / 2),
        row: Math.floor(idealNW.y / this.tileSide) + +(mod(idealNW.y, this.tileSide) > this.tileSide / 2),
      };

      const region: Region = { nw: { col, row }, se: { col: col + w - 1, row: row + h - 1 } };

      return {
        type: ActionType.BUILD,
        validity: this.grid.isFree(region, { road: this.build.type === TYPE_ROAD }) ? ActionValidity.VALID : ActionValidity.INVALID,
        region,
      };
    }

    const building = this.grid.buildingAt(this.getTileCoords(mouse));
    return { type: this.mode, validity: building ? ActionValidity.VALID : ActionValidity.UNAVAILABLE, region: building ?.region };
  }

  private feedbackAction({ type, validity, region }: Action): null {
    if (validity === ActionValidity.UNAVAILABLE) {
      opacityTransition(0, this.outline);
      return;
    }

    // drawn from bottom-center
    function roundedTop({ w, h, radius }: { w: number, h: number, radius: number }): string {
      return `m${-w / 2},0 v${-(h - radius)} a${radius},${radius} 0 0,1 ${radius},${-radius} h${w - 2 * radius} a${radius},${radius} 0 0,1 ${radius},${radius} v${h - radius} h${-w}`;
    }

    opacityTransition(1, this.outline.datum({ geo: this.computeGeometry(region) }));
    snapTransition(
      this.outline.attr('mode', this.mode).attr('error', validity === ActionValidity.INVALID),
    ).attr('transform', function ({ geo: { cx, cy } }) { return mergeTransforms(this, `translate(${cx} ${cy})`); });
    snapTransition(this.outline.select<SVGRectElement>('rect.region-outline'))
      .attr('x', ({ geo: { w } }) => -w / 2)
      .attr('y', ({ geo: { h } }) => -h / 2)
      .attr('width', ({ geo: { w } }) => w)
      .attr('height', ({ geo: { h } }) => h);
    snapTransition(this.outline.select<SVGRectElement>('text')
      .text(type.toLowerCase())
      .each(function () {
        const { width, height } = this.getBBox();
        TEXT_MEASUREMENTS.set(this.parentElement, { w: width + 20, h: height + 2 }); // padding: (outline.stroke-width / 2) corner-radius
      })).attr('y', ({ geo: { h } }) => -h / 2);
    setTimeout(() => snapTransition(this.outline.select<SVGRectElement>('path.text-bg'))
      .attr('transform', ({ geo: { h } }) => `translate(0, ${-h / 2})`)
      .attr('d', function () { return roundedTop({ w: TEXT_MEASUREMENTS.get(this).w, h: TEXT_MEASUREMENTS.get(this).h, radius: 10 }); }));
  }

  private executeAction({ validity, region }: Action): void {
    if (validity === ActionValidity.UNAVAILABLE) {
      return;
    }

    const amplitude = this.tileSide / 4;
    if (validity === ActionValidity.INVALID) {
      errorTransition(amplitude, this.outline.select<SVGRectElement>('rect'));
      return;
    }

    successTransition(amplitude, this.outline.select<SVGRectElement>('rect'));

    const building = this.grid.buildingAt(region ?.nw);
    switch (this.mode) {
      case ActionType.INSPECT:
        console.log(building);
        break;
      case ActionType.BUILD:
        this.grid.place(new Building(this.build.type), region);
        this.redrawBuildings();
        break;
      case ActionType.DESTROY:
        this.grid.remove(building);
        this.redrawBuildings();
        break;
      case ActionType.COPY:
        this.build.type = building.type;
        this.mode = ActionType.BUILD;
        break;
      default:
    }

    this.revalidateAction$.next(null);
  }

  private redraw(): void {
    const { x, y, w, h } = this.computeGeometry(this.grid.bounds);
    const { cols, rows } = computeLabels(this.grid.bounds);

    slowTransition(this.center)
      .attr('transform', `translate(${this.container.offsetWidth / 2}, ${this.container.offsetHeight / 2})`);
    slowTransition(this.zerozero)
      .attr('transform', `translate(${-(w / 2 + x[0])}, ${-(h / 2 + y[0])})`);

    slowTransition(this.axes.top)
      .attr('transform', `translate(0, ${y[0]})`)
      .call(axisTop(scaleBand().domain(cols).range(x)).tickSizeInner(0).tickSizeOuter(this.tileSide / 4));
    slowTransition(this.axes.bottom)
      .attr('transform', `translate(0, ${y[1]})`)
      .call(axisBottom(scaleBand().domain(cols).range(x)).tickSizeInner(0).tickSizeOuter(this.tileSide / 4));
    slowTransition(this.axes.left)
      .attr('transform', `translate(${x[0]}, 0)`)
      .call(axisLeft(scaleBand().domain(rows).range(y)).tickSizeInner(0).tickSizeOuter(this.tileSide / 4));
    slowTransition(this.axes.right)
      .attr('transform', `translate(${x[1]}, 0)`)
      .call(axisRight(scaleBand().domain(rows).range(y)).tickSizeInner(0).tickSizeOuter(this.tileSide / 4));

    this.redrawBackground();
    this.redrawBuildings();
    this.redrawHighlights();
  }

  private computeBackgroundGeometry(): Geometry {
    const { cx, cy } = this.computeGeometry(this.grid.bounds);
    const w = this.container.offsetWidth + 2; // 1px padding to each side
    const h = this.container.offsetHeight + 2; // 1px padding to each side

    return {
      w,
      h,
      cx,
      cy,
      x: [-w / 2 + cx, w / 2 + cx],
      y: [-h / 2 + cy, h / 2 + cy],
    };
  }

  private redrawBuildings(): void {
    this.buildings.selectAll<SVGRectElement, Building>('g')
      .data(
        this.grid.buildings.map(b => Object.assign(b, { geo: this.computeGeometry(b.region) })),
        d => String(d.id),
      )
      .join(
        enter => {
          const g = enter.append('g')
            .attr('transform', function ({ geo: { cx, cy } }) { return mergeTransforms(this, `translate(${cx} ${cy})`); });
          g.append('rect')
            .attr('x', ({ geo: { w } }) => -w / 2)
            .attr('y', ({ geo: { h } }) => -h / 2)
            .attr('width', ({ geo: { w } }) => w)
            .attr('height', ({ geo: { h } }) => h)
            .attr('fill', d => d.type.colour.hex())
            .attr('stroke', d => hsl(d.type.colour.hex()).darker(1.5).hex());
          g.append('text')
            .style('text-anchor', 'middle')
            .style('dominant-baseline', 'middle')
            .text(d => d.type.name);

          // g.call(e => enterTransition(e));
          return g;
        },
        update => {
          update.each(b => Object.assign(b, { geo: this.computeGeometry(b.region) }))
            .call(u => {
              slowTransition(u)
                .attr('transform', function ({ geo: { cx, cy } }) { return mergeTransforms(this, `translate(${cx} ${cy})`); });
              slowTransition(u.select<SVGRectElement>('rect'))
                .attr('x', ({ geo: { w } }) => -w / 2)
                .attr('y', ({ geo: { h } }) => -h / 2)
                .attr('width', ({ geo: { w } }) => w)
                .attr('height', ({ geo: { h } }) => h);
            });

          return update;
        },
        exit => exitTransition(exit),
      );
  }

  private redrawBackground(): void {
    const { w, h, x, y } = this.computeBackgroundGeometry();
    slowTransition(this.axes.rows)
      .attr('transform', `translate(${x[0]}, 0)`)
      .call(axisRight(scaleLinear().domain(y.map(d => d / this.tileSide)).range(y)).ticks(h / this.tileSide).tickSize(w));
    this.axes.rows.selectAll<SVGLineElement, number>('g.tick line')
      .style('stroke-width', d => (mod(d, SUBDIVISION_SIZE) ? 1 : 2));

    slowTransition(this.axes.cols)
      .attr('transform', `translate(0, ${y[0]})`)
      .call(axisBottom(scaleLinear().domain(x.map(d => d / this.tileSide)).range(x)).ticks(w / this.tileSide).tickSize(h));
    this.axes.cols.selectAll<SVGLineElement, number>('g.tick line')
      .style('stroke-width', d => (mod(d, SUBDIVISION_SIZE) ? 1 : 2));
  }

  private redrawHighlights(): void {
    if (!this.hovered) {
      opacityTransition(0, this.highlights.col);
      opacityTransition(0, this.highlights.row);
      return;
    }

    const { w, h, x, y } = this.computeBackgroundGeometry();
    opacityTransition(
      0.3,
      this.highlights.col
        .attr('x', this.hovered.col * this.tileSide)
        .attr('y', y[0])
        .attr('width', this.tileSide)
        .attr('height', h),
    );

    opacityTransition(
      0.3,
      this.highlights.row
        .attr('x', x[0])
        .attr('y', this.hovered.row * this.tileSide)
        .attr('width', w)
        .attr('height', this.tileSide),
    );
  }

  private getCanvasCoords({ offsetX, offsetY }: MouseEvent): CanvasCoords {
    const { x, y, w, h } = this.computeGeometry(this.grid.bounds);
    return ({
      x: offsetX + (w - this.container.offsetWidth) / 2 + x[0],
      y: offsetY + (h - this.container.offsetHeight) / 2 + y[0],
    });
  }

  private computeGeometry({ nw, se }: Region): Geometry {
    return {
      w: (se.col - nw.col + 1) * this.tileSide,
      h: (se.row - nw.row + 1) * this.tileSide,
      cx: (se.col + nw.col + 1) * (this.tileSide / 2),
      cy: (se.row + nw.row + 1) * (this.tileSide / 2),
      x: [nw.col * this.tileSide, (se.col + 1) * this.tileSide],
      y: [nw.row * this.tileSide, (se.row + 1) * this.tileSide],
    };
  }

  private getTileCoords({ x, y }: CanvasCoords): TileCoords | null {
    return { row: Math.floor(y / this.tileSide), col: Math.floor(x / this.tileSide) };
  }

  private computeTileSide(): number {
    const width = this.container.offsetWidth;
    const height = this.container.offsetHeight;
    const cols = this.grid.width + TILES_PADDING * 2;
    const rows = this.grid.height + TILES_PADDING * 2;

    return Math.min(Math.floor(width / cols), Math.floor(height / rows));
  }

}

customElements.define('designer-grid', DesignerGrid);
