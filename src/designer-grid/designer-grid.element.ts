import AutoComplete from '@tarekraafat/autocomplete.js';
import { range } from 'd3-array';
import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { color } from 'd3-color';
import { scaleLinear, scaleBand } from 'd3-scale';
import { select, Selection, local } from 'd3-selection';

import { resolve } from 'path';
import { fromEvent } from 'rxjs/internal/observable/fromEvent';
import { merge } from 'rxjs/internal/observable/merge';
import { distinctUntilChanged } from 'rxjs/internal/operators/distinctUntilChanged';
import { map } from 'rxjs/internal/operators/map';
import { startWith } from 'rxjs/internal/operators/startWith';
import { tap, mapTo } from 'rxjs/operators';

import { Building, BUILDING_TYPES, BuildingType } from 'src/designer-engine/building.class';
import { TileCoords, compareTileCoords } from 'src/designer-engine/definitions';
import { Grid } from 'src/designer-engine/grid.class';
import { randomTemplate } from 'src/designer-engine/templates';
import { untilDisconnected } from 'src/utils/customelement-disconnected';
import { mod } from 'src/utils/maths';
import { snapTransition, opacityTransition, slowTransition, errorTransition, exitTransition, successTransition, transition, DURATION } from 'src/utils/transitions';

import { ActionsManager, ActionValidity, Action, ActionType } from './actions-manager';
import { Geometrised, CoordinatesSystem } from './coordinates-system';

function pathTo(icon: string) {
  return resolve(__dirname, 'assets/anno-designer-presets/icons', icon);
}

const TEXT_MEASUREMENTS = local<{ w: number, h: number }>();
const SUBDIVISION_SIZE: number = 3;
const IMG_MEASURER: HTMLImageElement = new Image(); // TODO: should be part of building 'building-types.json'
function measureImage(icon: string): { w: number, h: number } {
  IMG_MEASURER.setAttribute('src', pathTo(icon));
  return { w: IMG_MEASURER.width, h: IMG_MEASURER.height };
}

class DesignerGrid extends HTMLElement {

  // HTML elements
  private container: HTMLElement;

  // D3 Selections
  private center: Selection<SVGGElement, unknown, null, undefined>;
  private zerozero: Selection<SVGGElement, unknown, null, undefined>;
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private buildings: Selection<SVGGElement, Geometrised<Building>, null, undefined>;
  private outline: Selection<SVGGElement, Geometrised<unknown>, null, undefined>;
  private secondary: Selection<SVGGElement, Geometrised<unknown>, null, undefined>;

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
  private readonly coords: CoordinatesSystem = new CoordinatesSystem();
  private readonly actions: ActionsManager = new ActionsManager(this.coords, this.grid);

  // These should be BehaviorSubjects, but can't due to a current bug in rxjs
  // See https://github.com/ReactiveX/rxjs/issues/5105
  private hovered: TileCoords | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  public connectedCallback(): void {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.append(document.createTextNode(require('./designer-grid.inline.scss')));
    this.shadowRoot.innerHTML += style.outerHTML + require('./designer-grid.template.html');

    new AutoComplete({ // eslint-disable-line no-new
      data: {
        src: BUILDING_TYPES,
        key: ['name'],
      },
      resultsList: {
        render: true,
        destination: this.shadowRoot.querySelector('[grid-area=buttons]'),
        position: 'beforeend',
        element: 'div',
      },
      resultItem: {
        content: ({ match, value }: { match: string, value: BuildingType }, source: HTMLParagraphElement) => {
          source.innerHTML = `${match}<hr /><img src="./assets/anno-designer-presets/icons/${value.icon}" />`; // eslint-disable-line
        },
        element: 'p',
      },
      selector: () => this.shadowRoot.querySelector('#autocomplete'),
      placeHolder: 'Search buildings...',
      highlight: true,
      onSelection: ({ selection: { value: type } }: {
        results: BuildingType[],
        selection: { value: BuildingType }
      }) => this.actions.startBuilding(type),
    });

    this.container = this.shadowRoot.querySelector('main');
    this.svg = select(this.shadowRoot.querySelector('svg'));

    this.shadowRoot.querySelector('button#dump').addEventListener('click', () => {
      console.log(this.grid.getCode());
    });
    this.shadowRoot.querySelector('button#load').addEventListener('click', () => {
      const code = prompt('Template code', randomTemplate());
      if (code) {
        this.grid.fromCode(code);
      }
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
    this.secondary = this.zerozero.append<SVGGElement>('g').datum(null as Geometrised<unknown>).attr('class', 'outline');
    this.secondary.append('path').attr('class', 'secondary-outline');
    this.outline = this.zerozero.append<SVGGElement>('g').datum(null as Geometrised<unknown>).attr('class', 'outline');
    this.outline.append('rect').attr('class', 'region-outline');
    this.outline.append('path').attr('class', 'text-bg');
    this.outline.append('text')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'text-after-edge');

    this.container.setAttribute('draggable', 'true');

    this.grid.boundsChanged$.pipe(untilDisconnected(this)).subscribe(bounds => this.coords.updateGridBounds(bounds));
    this.coords.systemUpdate$.pipe(untilDisconnected(this)).subscribe(() => this.recenter());

    this.actions.perform$.pipe(untilDisconnected(this)).subscribe(action => this.feedbackActionPerform(action));
    this.actions.update$.pipe(untilDisconnected(this)).subscribe(action => this.feedbackAction(action));

    fromEvent(window, 'resize').pipe(
      startWith(null),
      untilDisconnected(this),
    ).subscribe(() => this.coords.updateContainerSize(this.container));

    merge(
      fromEvent<MouseEvent>(this.container, 'mousemove'),
      fromEvent<MouseEvent>(this.container, 'click'),
    ).pipe(
      map(e => this.coords.toTileCoords(e)),
      distinctUntilChanged(compareTileCoords),
      untilDisconnected(this),
    ).subscribe(() => this.coords.notifyActivity());

    fromEvent<DragEvent>(this.container, 'dragstart').pipe(
      tap(e => e.preventDefault()),
      map(e => this.coords.toLocalCoords(e)),
      untilDisconnected(this),
    ).subscribe(xy => this.actions.dragstart(xy));

    fromEvent<MouseEvent>(this.container, 'click').pipe(
      map(e => this.coords.toLocalCoords(e)),
      untilDisconnected(this),
    ).subscribe(xy => this.actions.click(xy));

    fromEvent<MouseEvent>(this.container, 'contextmenu').pipe(
      tap(e => e.preventDefault()),
      map(e => this.coords.toLocalCoords(e)),
      untilDisconnected(this),
    ).subscribe(xy => this.actions.rightclick(xy));

    fromEvent<KeyboardEvent>(this.getRootNode(), 'keydown').pipe(
      untilDisconnected(this),
    ).subscribe(e => this.actions.keypress(e));

    fromEvent<MouseEvent>(this.container, 'mousemove').pipe(
      map(e => this.coords.toLocalCoords(e)),
      untilDisconnected(this),
    ).subscribe(xy => this.actions.mousemove(xy));

    merge(
      fromEvent<MouseEvent>(this.container, 'mousemove').pipe(map(e => this.coords.toTileCoords(this.coords.toLocalCoords(e)))),
      fromEvent<MouseEvent>(this.container, 'mouseleave').pipe(mapTo(null)),
    ).pipe(
      distinctUntilChanged(compareTileCoords),
      tap(at => this.hovered = at),
      untilDisconnected(this),
    ).subscribe(() => this.redrawHighlights());
  }

  public disconnectedCallback(): void { }

  private feedbackAction({ type, validity, region, building }: Action): null {
    if (validity === ActionValidity.UNAVAILABLE) {
      opacityTransition(0, this.outline);
      opacityTransition(0, this.secondary);
      return;
    }

    // TODO: maybe extract in 'shapes' helpers file?
    // drawn from bottom-center
    function roundedTop({ w, h, radius }: { w: number, h: number, radius: number }): string {
      return `m${-w / 2},0 v${-(h - radius)} a${radius},${radius} 0 0,1 ${radius},${-radius} h${w - 2 * radius} a${radius},${radius} 0 0,1 ${radius},${radius} v${h - radius} h${-w}`;
    }

    // drawn from center-center
    function box({ geo: { w, h } }: Geometrised<any>): string {
      return `m${-w / 2},${-h / 2} h${w} v${h} h${-w} v${-h}`;
    }

    opacityTransition(1, this.outline.datum({ geo: this.coords.computeGeometry(region) }));
    snapTransition(
      this.outline.attr('mode', type).attr('error', validity === ActionValidity.INVALID),
    ).attr('transform', ({ geo: { cx, cy } }) => `translate(${cx} ${cy})`);
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
    snapTransition(this.outline.select<SVGRectElement>('path.text-bg'))
      .attr('transform', ({ geo: { h } }) => `translate(0, ${-h / 2})`)
      .attr('d', function () { return roundedTop({ w: TEXT_MEASUREMENTS.get(this).w, h: TEXT_MEASUREMENTS.get(this).h, radius: 10 }); });

    // Secondary outline
    if (type === ActionType.MOVE_COMPLETE) {
      opacityTransition(1, this.secondary.datum({ geo: this.coords.computeGeometry(building.region) }));
      snapTransition(
        this.secondary.attr('mode', type).attr('error', validity === ActionValidity.INVALID),
      ).attr('transform', ({ geo: { cx, cy } }) => `translate(${cx} ${cy})`);
      snapTransition(this.secondary.select<SVGPathElement>('path.secondary-outline'))
        .attr('d', box);
    } else {
      opacityTransition(0, this.secondary);
    }
  }

  private feedbackActionPerform({ type, validity }: Action): void {
    if (validity === ActionValidity.UNAVAILABLE) {
      return;
    }

    const amplitude = this.coords.tileSide / 4;
    if (validity === ActionValidity.INVALID) {
      errorTransition(amplitude, this.outline.select<SVGRectElement>('rect'));
    } else {
      successTransition(amplitude, this.outline.select<SVGRectElement>('rect'));
      this.redrawBuildings(); // TODO: should be bound to a notification from Grid that the buildings list has evolved
    }

    if (type === ActionType.MOVE_COMPLETE) {
      if (validity === ActionValidity.INVALID) {
        errorTransition(amplitude, this.secondary.select<SVGPathElement>('path'));
      } else {
        successTransition(amplitude, this.secondary.select<SVGPathElement>('path'));
      }
    }
  }

  private recenter(): void {
    const { x, y, w, h } = this.coords.computeGeometry(this.grid.bounds);

    slowTransition(this.center)
      .attr('transform', `translate(${this.container.offsetWidth / 2}, ${this.container.offsetHeight / 2})`);
    slowTransition(this.zerozero)
      .attr('transform', `translate(${-(w / 2 + x[0])}, ${-(h / 2 + y[0])})`);

    this.redrawBackground();
    this.redrawBuildings(DURATION.SLOW);
    this.redrawHighlights(); // TODO: pass DURATION.SLOW maybe?
  }

  private redrawBuildings(duration?: DURATION): void {
    const { x, y, cols, rows } = this.coords.computeGeometry(this.grid.bounds);
    transition(this.axes.top, duration)
      .attr('transform', `translate(0, ${y[0]})`)
      .call(axisTop(scaleBand().domain(range(1, cols + 1).map(String)).range(x)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));
    transition(this.axes.bottom, duration)
      .attr('transform', `translate(0, ${y[1]})`)
      .call(axisBottom(scaleBand().domain(range(1, cols + 1).map(String)).range(x)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));
    transition(this.axes.left, duration)
      .attr('transform', `translate(${x[0]}, 0)`)
      .call(axisLeft(scaleBand().domain(range(1, rows + 1).map(String)).range(y)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));
    transition(this.axes.right, duration)
      .attr('transform', `translate(${x[1]}, 0)`)
      .call(axisRight(scaleBand().domain(range(1, rows + 1).map(String)).range(y)).tickSize(0).tickSizeOuter(this.coords.tileSide / 4));

    function fit({ w, h }, { w: maxW, h: maxH }): { w: number, h: number } {
      if (w > maxW || h > maxH) {
        return {
          w: w * Math.min(maxW / w, maxH / h),
          h: h * Math.min(maxW / w, maxH / h),
        };
      }

      return { w, h };
    }

    this.buildings.selectAll<SVGRectElement, Building>('g')
      .data(
        [...this.grid.buildings].map(b => Object.assign(b, { geo: this.coords.computeGeometry(b.region) })),
        d => String(d.id),
      )
      .join(
        enter => {
          const g = enter.append('g')
            .attr('transform', ({ geo: { cx, cy } }) => `translate(${cx} ${cy})`);
          g.append('rect')
            .attr('x', ({ geo: { w } }) => -w / 2)
            .attr('y', ({ geo: { h } }) => -h / 2)
            .attr('width', ({ geo: { w } }) => w)
            .attr('height', ({ geo: { h } }) => h)
            .style('fill', ({ type: { colour } }) => colour)
            .style('stroke', ({ type: { colour } }) => color(colour).darker(2).hex());

          g.append('image').datum(b => ({ ...b, img: measureImage(b.type.icon) }))
            .attr('xlink:href', ({ type: { icon } }) => pathTo(icon))
            .attr('x', ({ geo, img }) => -fit(img, geo).w / 2)
            .attr('y', ({ geo, img }) => -fit(img, geo).h / 2)
            .attr('width', ({ geo, img }) => fit(img, geo).w)
            .attr('height', ({ geo, img }) => fit(img, geo).h);

          return g;
        },
        update => {
          update.each(b => Object.assign(b, { geo: this.coords.computeGeometry(b.region) }))
            .call(u => {
              transition(u, duration)
                .attr('transform', ({ geo: { cx, cy } }) => `translate(${cx} ${cy})`);
              transition(u.select<SVGRectElement>('rect'), duration)
                .attr('x', ({ geo: { w } }) => -w / 2)
                .attr('y', ({ geo: { h } }) => -h / 2)
                .attr('width', ({ geo: { w } }) => w)
                .attr('height', ({ geo: { h } }) => h);
              transition(u.select<SVGImageElement>('image').datum(b => ({ ...b, img: measureImage(b.type.icon) })), duration)
                .attr('x', ({ geo, img }) => -fit(img, geo).w / 2)
                .attr('y', ({ geo, img }) => -fit(img, geo).h / 2)
                .attr('width', ({ geo, img }) => fit(img, geo).w)
                .attr('height', ({ geo, img }) => fit(img, geo).h);
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
