import { range } from 'd3-array';
import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { hsl } from 'd3-color';
import { scaleLinear, scaleBand } from 'd3-scale';
import { select, Selection, local } from 'd3-selection';

import { Observable } from 'rxjs/internal/Observable';
import { Subject } from 'rxjs/internal/Subject';
import { combineLatest } from 'rxjs/internal/observable/combineLatest';
import { fromEvent } from 'rxjs/internal/observable/fromEvent';
import { merge } from 'rxjs/internal/observable/merge';
import { distinctUntilChanged } from 'rxjs/internal/operators/distinctUntilChanged';
import { map } from 'rxjs/internal/operators/map';

import { startWith } from 'rxjs/internal/operators/startWith';

import { filter, tap, mapTo } from 'rxjs/operators';

import { Building, BuildingType, TYPE_ROAD, TYPE_FARM, rotate, ORIENTATION } from 'src/designer-engine/building.class';
import { TileCoords, Region, compareRegions, compareTileCoords } from 'src/designer-engine/definitions';
import { Grid } from 'src/designer-engine/grid.class';
import { untilDisconnected } from 'src/utils/customelement-disconnected';
import { mod } from 'src/utils/maths';
import { not, exists } from 'src/utils/nullable';
import { snapTransition, opacityTransition, slowTransition, errorTransition, exitTransition, mergeTransforms, successTransition } from 'src/utils/transitions';

import { Geometrised, LocalCoords, CoordinatesSystem } from './coordinates-system';

const TEXT_MEASUREMENTS = local<{ w: number, h: number }>();

enum ActionValidity { VALID, INVALID, UNAVAILABLE }
enum ActionType { // string values are referenced in css
  INSPECT = 'INSPECT',
  BUILD = 'BUILD',
  DESTROY = 'DESTROY',
  COPY = 'COPY',
  MOVE_PICK = 'MOVE_PICK',
  MOVE_COMPLETE = 'MOVE_COMPLETE',
}

const SUBDIVISION_SIZE: number = 3;

type Action = { type: ActionType, validity: ActionValidity, region: Region | null, building?: Building };

function compareActions(a: Action | null, b: Action | null): boolean {
  return not(a) ? not(b) : exists(b) && a.type === b.type && a.validity === b.validity && compareRegions(a.region, b.region);
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
  private readonly grid: Grid = new Grid();
  private mode: ActionType = ActionType.INSPECT;
  private readonly build: { type: BuildingType, orientation: ORIENTATION } = { type: TYPE_ROAD, orientation: ORIENTATION.HORIZONTAL };
  private readonly move: { building: Building | null } = { building: null };

  // Helper classes
  private readonly coords: CoordinatesSystem = new CoordinatesSystem();

  // These should be BehaviorSubjects, but can't due to a current bug in rxjs
  // See https://github.com/ReactiveX/rxjs/issues/5105
  private hovered: TileCoords | null;

  // Cursor Observables
  private readonly revalidate$: Subject<null> = new Subject();
  private move$: Observable<LocalCoords>;
  private click$: Observable<LocalCoords>;
  private dragstart$: Observable<LocalCoords>;

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

    this.container.setAttribute('draggable', 'true');

    this.grid.boundsChanged$.pipe(
      untilDisconnected(this),
    ).subscribe(bounds => this.coords.updateGridBounds(bounds));

    fromEvent(window, 'resize').pipe(
      startWith(null),
      untilDisconnected(this),
    ).subscribe(() => this.coords.updateContainerSize(this.container));

    this.coords.systemUpdate$.pipe(
      untilDisconnected(this),
    ).subscribe(() => this.recenter());

    fromEvent<MouseEvent>(this.container, 'mousemove').pipe(
      map(e => this.coords.toTileCoords(e)),
      distinctUntilChanged(compareTileCoords),
      untilDisconnected(this),
    ).subscribe(() => this.coords.notifyActivity());

    fromEvent<DragEvent>(this.container, 'dragstart').pipe(
      tap(e => e.preventDefault()),
      map(e => this.coords.toLocalCoords(e)),
      untilDisconnected(this),
    ).subscribe(this.dragstart$ = new Subject());

    fromEvent<MouseEvent>(this.container, 'click').pipe(
      map(e => this.coords.toLocalCoords(e)),
      untilDisconnected(this),
    ).subscribe(this.click$ = new Subject());

    combineLatest([
      fromEvent<MouseEvent>(this.container, 'mousemove'),
      this.revalidate$.pipe(startWith(null)),
    ]).pipe(
      map(([e]) => this.coords.toLocalCoords(e)),
      untilDisconnected(this),
    ).subscribe(this.move$ = new Subject());

    this.listen();
  }

  public disconnectedCallback(): void { }

  private listen(): void {
    fromEvent<KeyboardEvent>(this.getRootNode(), 'keydown').pipe(
      untilDisconnected(this),
    ).subscribe(({ key }) => {
      switch (key.toLowerCase()) {
        case '.':
        case ',':
        case 'q':
        case 'e':
          this.build.orientation = this.build.orientation === ORIENTATION.HORIZONTAL ? ORIENTATION.VERTICAL : ORIENTATION.HORIZONTAL;
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
        case 'm':
          this.mode = ActionType.MOVE_PICK;
          break;
        case 's':
          this.mode = ActionType.BUILD;
          this.build.type = TYPE_ROAD;
          break;
        case 'escape':
          this.coords.updateNow();
          this.mode = ActionType.INSPECT;
          break;
        default: return;
      }

      this.revalidate();
    });

    merge(
      this.move$.pipe(map(xy => this.coords.toTileCoords(xy))),
      fromEvent<MouseEvent>(this.container, 'mouseleave').pipe(mapTo(null)),
    ).pipe(
      distinctUntilChanged(compareTileCoords),
      tap(at => this.hovered = at),
      untilDisconnected(this),
    ).subscribe(() => this.redrawHighlights());

    this.move$.pipe(
      map(xy => this.validateAction(xy)),
      distinctUntilChanged(compareActions),
      untilDisconnected(this),
    ).subscribe(action => this.feedbackAction(action));

    this.click$.pipe(
      map(xy => this.validateAction(xy)),
      untilDisconnected(this),
    ).subscribe(action => this.executeAction(action));

    this.dragstart$.pipe(
      filter(() => this.mode === ActionType.INSPECT || this.mode === ActionType.MOVE_PICK),
      map(xy => this.grid.buildingAt(this.coords.toTileCoords(xy))),
      filter(building => !!building),
      untilDisconnected(this),
    ).subscribe(building => {
      this.mode = ActionType.MOVE_COMPLETE;
      this.move.building = building;
      this.build.orientation = building.orientation;
    });

    fromEvent<MouseEvent>(this.container, 'contextmenu').pipe(
      tap(e => e.preventDefault()),
      untilDisconnected(this),
    ).subscribe(() => {
      this.coords.updateNow();
      this.mode = ActionType.INSPECT;
      this.revalidate();
    });
  }

  private revalidate(): void {
    this.revalidate$.next();
  }

  private validateAction(xy: LocalCoords): Action {
    if (this.mode === ActionType.BUILD) {
      const region = this.coords.snapToGrid(xy, rotate(this.build.type, this.build.orientation));
      return {
        type: ActionType.BUILD,
        validity: this.grid.isFree(region, { road: this.build.type === TYPE_ROAD }) ? ActionValidity.VALID : ActionValidity.INVALID,
        region,
      };
    }

    if (this.mode === ActionType.MOVE_COMPLETE) {
      const { building } = this.move;
      const region = this.coords.snapToGrid(xy, rotate(building.type, this.build.orientation));
      return {
        type: ActionType.MOVE_COMPLETE,
        validity: this.grid.isFree(region, { road: building.type === TYPE_ROAD, ignore: building })
          ? ActionValidity.VALID
          : ActionValidity.INVALID,
        region,
        building,
      };
    }

    const building = this.grid.buildingAt(this.coords.toTileCoords(xy));
    return { type: this.mode, validity: building ? ActionValidity.VALID : ActionValidity.UNAVAILABLE, region: building ?.region, building };
  }

  private feedbackAction({ type, validity, region }: Action): null {
    if (validity === ActionValidity.UNAVAILABLE) {
      opacityTransition(0, this.outline);
      return;
    }

    // TODO: maybe extract in 'shapes' helpers file?
    // drawn from bottom-center
    function roundedTop({ w, h, radius }: { w: number, h: number, radius: number }): string {
      return `m${-w / 2},0 v${-(h - radius)} a${radius},${radius} 0 0,1 ${radius},${-radius} h${w - 2 * radius} a${radius},${radius} 0 0,1 ${radius},${radius} v${h - radius} h${-w}`;
    }

    opacityTransition(1, this.outline.datum({ geo: this.coords.computeGeometry(region) }));
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

  private executeAction({ type, validity, region, building }: Action): void {
    if (validity === ActionValidity.UNAVAILABLE) {
      return;
    }

    const amplitude = this.coords.tileSide / 4;
    if (validity === ActionValidity.INVALID) {
      errorTransition(amplitude, this.outline.select<SVGRectElement>('rect'));
      return;
    }

    switch (type) {
      case ActionType.INSPECT:
        console.log('inspect', building);
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
        this.build.orientation = building.orientation;
        this.mode = ActionType.BUILD;
        break;
      case ActionType.MOVE_PICK:
        this.move.building = building;
        this.build.orientation = building.orientation;
        this.mode = ActionType.MOVE_COMPLETE;
        break;
      case ActionType.MOVE_COMPLETE:
        this.grid.place(building, region);
        this.mode = ActionType.MOVE_PICK;
        this.redrawBuildings();
        break;
      default: return;
    }

    successTransition(amplitude, this.outline.select<SVGRectElement>('rect'));
    this.revalidate();
  }

  private recenter(): void {
    const { x, y, w, h } = this.coords.computeGeometry(this.grid.bounds);

    slowTransition(this.center)
      .attr('transform', `translate(${this.container.offsetWidth / 2}, ${this.container.offsetHeight / 2})`);
    slowTransition(this.zerozero)
      .attr('transform', `translate(${-(w / 2 + x[0])}, ${-(h / 2 + y[0])})`);

    this.redrawBackground();
    this.redrawBuildings();
    this.revalidate();
  }

  private redrawBuildings(): void {
    const { x, y, cols, rows } = this.coords.computeGeometry(this.grid.bounds);
    slowTransition(this.axes.top)
      .attr('transform', `translate(0, ${y[0]})`)
      .call(axisTop(scaleBand().domain(range(1, cols + 1).map(String)).range(x)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));
    slowTransition(this.axes.bottom)
      .attr('transform', `translate(0, ${y[1]})`)
      .call(axisBottom(scaleBand().domain(range(1, cols + 1).map(String)).range(x)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));
    slowTransition(this.axes.left)
      .attr('transform', `translate(${x[0]}, 0)`)
      .call(axisLeft(scaleBand().domain(range(1, rows + 1).map(String)).range(y)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));
    slowTransition(this.axes.right)
      .attr('transform', `translate(${x[1]}, 0)`)
      .call(axisRight(scaleBand().domain(range(1, rows + 1).map(String)).range(y)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));

    this.buildings.selectAll<SVGRectElement, Building>('g')
      .data(
        [...this.grid.buildings].map(b => Object.assign(b, { geo: this.coords.computeGeometry(b.region) })),
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
          update.each(b => Object.assign(b, { geo: this.coords.computeGeometry(b.region) }))
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
    const { x, y, w, h } = this.coords.background;
    slowTransition(this.axes.rows)
      .attr('transform', `translate(${x[0]}, 0)`)
      .call(axisRight(scaleLinear().domain(y.map(d => d / this.coords.tileSide)).range(y)).ticks(h / this.coords.tileSide).tickSize(w));
    this.axes.rows.selectAll<SVGLineElement, number>('g.tick line')
      .style('stroke-width', d => (mod(d, SUBDIVISION_SIZE) ? 1 : 2));

    slowTransition(this.axes.cols)
      .attr('transform', `translate(0, ${y[0]})`)
      .call(axisBottom(scaleLinear().domain(x.map(d => d / this.coords.tileSide)).range(x)).ticks(w / this.coords.tileSide).tickSize(h));
    this.axes.cols.selectAll<SVGLineElement, number>('g.tick line')
      .style('stroke-width', d => (mod(d, SUBDIVISION_SIZE) ? 1 : 2));
  }

  private redrawHighlights(): void {
    if (!this.hovered) {
      opacityTransition(0, this.highlights.col);
      opacityTransition(0, this.highlights.row);
      return;
    }

    const { x, y, w, h } = this.coords.background;
    opacityTransition(
      0.3,
      this.highlights.col
        .attr('x', this.hovered.col * this.coords.tileSide)
        .attr('y', y[0])
        .attr('width', this.coords.tileSide)
        .attr('height', h),
    );

    opacityTransition(
      0.3,
      this.highlights.row
        .attr('x', x[0])
        .attr('y', this.hovered.row * this.coords.tileSide)
        .attr('width', w)
        .attr('height', this.coords.tileSide),
    );
  }

}

customElements.define('designer-grid', DesignerGrid);
