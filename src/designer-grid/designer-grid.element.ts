import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { scaleLinear, scaleBand } from 'd3-scale';
import { select, Selection } from 'd3-selection';

import { ReplaySubject } from 'rxjs/internal/ReplaySubject';
import { combineLatest } from 'rxjs/internal/observable/combineLatest';
import { fromEvent } from 'rxjs/internal/observable/fromEvent';
import { merge } from 'rxjs/internal/observable/merge';
import { debounceTime } from 'rxjs/internal/operators/debounceTime';
import { distinctUntilChanged } from 'rxjs/internal/operators/distinctUntilChanged';
import { map } from 'rxjs/internal/operators/map';

import { startWith } from 'rxjs/internal/operators/startWith';

import { TYPE_FARM, BuildingType, TYPE_ROAD } from 'src/designer-engine/building-type.class';
import { Building } from 'src/designer-engine/building.class';
import { Grid, TileCoords, Region, compareCoordinates, compareRegions } from 'src/designer-engine/grid.class';
import { untilDisconnected } from 'src/utils/customelement-disconnected';
import { mod } from 'src/utils/maths';
import { not, exists } from 'src/utils/nullable';
import { snapTransition, opacityTransition, slowTransition, errorTransition, exitTransition, mergeTransforms, successTransition } from 'src/utils/transitions';

enum ActionValidity { VALID, INVALID, UNAVAILABLE }
enum ActionType { INSPECT = 'INSPECT', BUILD = 'BUILD', DESTROY = 'DESTROY', COPY = 'COPY' } // string values are used in css

export type CanvasCoords = { x: number, y: number };
export type Geometry = CanvasCoords & { w: number, h: number, ctr: CanvasCoords };
export type Geometrised<Datum> = Datum & {geo: Geometry};
type Action = { type: ActionType, validity: ActionValidity, region: Region | null };

function compareActions(a: Action | null, b: Action | null): boolean {
  return not(a) ? not(b) : exists(b) && a.type === b.type && a.validity === b.validity && compareRegions(a.region, b.region);
}

function computeGeometry({ nw: { col: x, row: y }, se: { col: x2, row: y2 } }: Region, side: number): Geometry {
  return { x, y, w: (x2 - x + 1) * side, h: (y2 - y + 1) * side, ctr: { x: (x + x2 + 1) * side / 2, y: (y + y2 + 1) * side / 2 } }; // eslint-disable-line no-mixed-operators
}

class DesignerGrid extends HTMLElement {

  // HTML elements
  private container: HTMLElement;
  private btnFarm: HTMLButtonElement;
  private btnRoad: HTMLButtonElement;
  private btnDestroy: HTMLButtonElement;
  private btnInspect: HTMLButtonElement;

  // D3 Selections

  private root: Selection<SVGGElement, unknown, null, undefined>;
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

  // Private properties
  private margins = { top: 50, right: 50, bottom: 50, left: 50 };

  // Engine model
  private grid: Grid = new Grid();
  private mode: ActionType = ActionType.INSPECT;
  private readonly build: { type: BuildingType, rotate: boolean } = { type: TYPE_ROAD, rotate: false };

  private mouseCoords$: ReplaySubject<CanvasCoords> = new ReplaySubject(1);
  private revalidateAction$: ReplaySubject<null> = new ReplaySubject(1);

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.grid.place(new Building(TYPE_FARM), { nw: { row: 1, col: 1 }, se: { row: 2, col: 3 } });
    this.grid.placeRoad({ row: 0, col: 2 }, { row: 3, col: 3 });
    this.grid.placeRoad({ row: 0, col: 0 }, { row: 3, col: 9 });
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

    this.root = this.svg.append('g').attr('class', 'root').attr('transform', `translate(${this.margins.right}, ${this.margins.top})`);
    this.highlights = {
      row: this.root.append('rect').datum<number | null>(null).attr('class', 'highlight'),
      col: this.root.append('rect').datum<number | null>(null).attr('class', 'highlight'),
    };

    this.axes = {
      top: this.root.append('g').attr('class', 'axis top'),
      right: this.root.append('g').attr('class', 'axis right'),
      bottom: this.root.append('g').attr('class', 'axis bottom'),
      left: this.root.append('g').attr('class', 'axis left'),
      rows: this.root.append('g').attr('class', 'axis rows'),
      cols: this.root.append('g').attr('class', 'axis cols'),
    };

    this.buildings = this.root.append('g').attr('class', 'buildings') as Selection<SVGGElement, Geometrised<Building>, any, any>;
    this.outline = this.root.append<SVGGElement>('g').datum(null as Geometrised<unknown>).attr('class', 'outline');
    this.outline.append('rect');
    this.outline.append('text')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'text-after-edge');

    this.redraw();

    fromEvent(window, 'resize').pipe(
      debounceTime(50),
      untilDisconnected(this),
    ).subscribe(() => this.redraw());

    merge(
      fromEvent<MouseEvent>(this.container, 'mousemove'),
      fromEvent<MouseEvent>(this.container, 'mouseenter'),
      fromEvent<MouseEvent>(this.container, 'mouseleave'),
    ).pipe(
      map(e => this.getCanvasCoords(e)),
      untilDisconnected(this),
    ).subscribe(this.mouseCoords$);

    this.mouseCoords$.pipe(
      map(e => this.getTileCoords(e)),
      distinctUntilChanged(compareCoordinates),
      untilDisconnected(this),
    ).subscribe(at => this.redrawHighlights(at));

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
    ).subscribe(action => this.validationFeedback(action));

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

  private getTileCoords({ x, y }: CanvasCoords): TileCoords | null {
    const side = this.computeTileSide();
    if (x > 0 && x < this.grid.width * side && y > 0 && y < this.grid.height * side) {
      return { row: Math.floor(y / side), col: Math.floor(x / side) };
    }

    return null;
  }

  // TODO: maybe extract code into separate class
  private validateAction(mouse: CanvasCoords | null): Action {
    const tile = this.getTileCoords(mouse);

    if (this.mode === ActionType.BUILD) {
      const side = this.computeTileSide();
      const { width: w, height: h } = this.build.rotate
        ? { width: this.build.type.height, height: this.build.type.width }
        : this.build.type;
      const idealNW: CanvasCoords = { x: mouse.x - (w / 2) * side, y: mouse.y - (h / 2) * side };
      const { col, row }: TileCoords = {
        col: Math.floor(idealNW.x / side) + +(mod(idealNW.x, side) > side / 2),
        row: Math.floor(idealNW.y / side) + +(mod(idealNW.y, side) > side / 2),
      };

      const region: Region = { nw: { col, row }, se: { col: col + w - 1, row: row + h - 1 } };

      return {
        type: ActionType.BUILD,
        region,
        validity: (this.build.type === TYPE_ROAD ? this.grid.isFreeForRoad(region) : this.grid.isFree(region))
          ? ActionValidity.VALID
          : ActionValidity.INVALID,
      };
    }

    const building = this.grid.buildingAt(tile);
    return { type: this.mode, validity: building ? ActionValidity.VALID : ActionValidity.UNAVAILABLE, region: building ?.region };
  }

  private validationFeedback({ type, validity, region }: Action): null {
    if (validity === ActionValidity.UNAVAILABLE) {
      opacityTransition(0, this.outline);
      return;
    }

    opacityTransition(1, this.outline.datum({ geo: computeGeometry(region, this.computeTileSide()) }));
    snapTransition(
      this.outline.attr('mode', this.mode).attr('error', validity === ActionValidity.INVALID),
    ).attr('transform', function ({ geo: { ctr: { x, y } } }) { return mergeTransforms(this, `translate(${x} ${y})`); });
    snapTransition(this.outline.select<SVGRectElement>('rect'))
      .attr('x', ({ geo: { w } }) => -w / 2)
      .attr('y', ({ geo: { h } }) => -h / 2)
      .attr('width', ({ geo: { w } }) => w)
      .attr('height', ({ geo: { h } }) => h);
    snapTransition(this.outline.select<SVGRectElement>('text').text(type.toLowerCase()))
      .attr('y', ({ geo: { h } }) => -h / 2);
  }

  private executeAction({ validity, region }: Action): void {
    if (validity === ActionValidity.UNAVAILABLE) {
      return;
    }

    const amplitude = this.computeTileSide() / 4;
    if (validity === ActionValidity.INVALID) {
      errorTransition(amplitude, this.outline.select<SVGRectElement>('rect'));

      return;
    }

    successTransition(amplitude, this.outline.select<SVGRectElement>('rect'));

    const building = this.grid.buildingAt(region ?.nw);
    switch (this.mode) {
      case ActionType.INSPECT:
        this.inspect(building);
        break;
      case ActionType.BUILD:
        this.grid.place(new Building(this.build.type), region);
        this.redrawBuildings();
        break;
      case ActionType.DESTROY:
        this.grid.destroy(building);
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

  private inspect(building: Building | null): void {
    console.log(building);
  }

  private redraw(): void {
    const side = this.computeTileSide();
    slowTransition(this.root)
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`);

    slowTransition(this.axes.top)
      .call(axisTop(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * side])));

    slowTransition(this.axes.bottom)
      .attr('transform', `translate(0, ${this.grid.height * side})`)
      .call(axisBottom(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * side])));

    slowTransition(this.axes.left)
      .call(axisLeft(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * side])));

    slowTransition(this.axes.right)
      .attr('transform', `translate(${this.grid.width * side}, 0)`)
      .call(axisRight(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * side])));

    slowTransition(this.axes.rows).call(
      axisRight(
        scaleLinear().domain([0, this.grid.height]).range([0, this.grid.height * side]),
      ).tickFormat(() => '').tickSize(this.grid.width * side),
    );

    slowTransition(this.axes.cols).call(
      axisBottom(
        scaleLinear().domain([0, this.grid.width]).range([0, this.grid.width * side]),
      ).tickFormat(() => '').tickSize(this.grid.height * side),
    );

    this.redrawBuildings();
  }

  private redrawBuildings(): void {
    const side = this.computeTileSide();
    this.buildings.selectAll<SVGRectElement, Building>('g')
      .data(
        this.grid.buildings.map(b => Object.assign(b, { geo: computeGeometry(b.region, side) })),
        d => String(d.id),
      )
      .join(
        enter => {
          const g = enter.append('g')
            .attr('transform', function ({ geo: { ctr: { x, y } } }) { return mergeTransforms(this, `translate(${x} ${y})`); });
          g.append('rect')
            .attr('x', ({ geo: { w } }) => -w / 2)
            .attr('y', ({ geo: { h } }) => -h / 2)
            .attr('width', ({ geo: { w } }) => w)
            .attr('height', ({ geo: { h } }) => h)
            .attr('fill', d => d.type.colour.hex());
          g.append('text')
            .style('text-anchor', 'middle')
            .style('dominant-baseline', 'middle')
            .text(d => d.type.name);

          // g.call(e => enterTransition(e));
          return g;
        },
        update => {
          update.each(b => Object.assign(b, { geo: computeGeometry(b.region, side) }))
            .call(u => {
              slowTransition(u)
                .attr('transform', function ({ geo: { ctr: { x, y } } }) { return mergeTransforms(this, `translate(${x} ${y})`); });
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

  private redrawHighlights(at: TileCoords | null): void {
    if (at) {
      const side = this.computeTileSide();
      opacityTransition(
        0.3,
        this.highlights.col.attr('width', side).attr('height', this.grid.height * side).attr('x', at.col * side),
      );

      opacityTransition(
        0.3,
        this.highlights.row.attr('height', side).attr('width', this.grid.width * side).attr('y', at.row * side),
      );
    } else {
      opacityTransition(0, this.highlights.col);
      opacityTransition(0, this.highlights.row);
    }
  }

  private computeTileSide(): number {
    const width = this.container.offsetWidth - this.margins.left - this.margins.right;
    const height = this.container.offsetHeight - this.margins.top - this.margins.bottom;

    const cols = this.grid.width;
    const rows = this.grid.height;

    return Math.min(Math.floor(width / cols), Math.floor(height / rows));
  }

  private getCanvasCoords({ offsetX, offsetY }: MouseEvent): CanvasCoords {
    return ({ x: offsetX - this.margins.left, y: offsetY - this.margins.top });
  }

}

customElements.define('designer-grid', DesignerGrid);
