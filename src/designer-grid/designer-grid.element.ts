import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { scaleLinear, scaleBand } from 'd3-scale';
import { select, Selection } from 'd3-selection';

import { fromEvent } from 'rxjs/internal/observable/fromEvent';
import { merge } from 'rxjs/internal/observable/merge';
import { debounceTime } from 'rxjs/internal/operators/debounceTime';
import { distinctUntilChanged } from 'rxjs/internal/operators/distinctUntilChanged';
import { map } from 'rxjs/internal/operators/map';

import { TYPE_FARM, BuildingType, TYPE_ROAD } from 'src/designer-engine/building-type.class';
import { Building } from 'src/designer-engine/building.class';
import { Grid, Coordinates, Region, compareCoordinates, compareRegions } from 'src/designer-engine/grid.class';
import { untilDisconnected } from 'src/utils/customelement-disconnected';
import { floor } from 'src/utils/maths';
import { snapTransition, opacityTransition, slowTransition } from 'src/utils/transitions';

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
  private buildings: Selection<SVGGElement, Building, null, undefined>;
  private outline: Selection<SVGRectElement, unknown, null, undefined>;

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
  private margins = { top: 20, right: 20, bottom: 20, left: 20 };

  // Engine model
  private mode: 'build' | 'destroy' | 'inspect' = 'build';
  private buildType: BuildingType = TYPE_ROAD;
  private grid: Grid = new Grid();

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
    this.btnFarm = this.shadowRoot.querySelector('button#farm');
    this.btnRoad = this.shadowRoot.querySelector('button#road');
    this.btnDestroy = this.shadowRoot.querySelector('button#destroy');
    this.btnInspect = this.shadowRoot.querySelector('button#inspect');
    this.btnFarm.addEventListener('click', () => (this.mode = 'build', this.buildType = TYPE_FARM));
    this.btnRoad.addEventListener('click', () => (this.mode = 'build', this.buildType = TYPE_ROAD));
    this.btnDestroy.addEventListener('click', () => this.mode = 'destroy');
    this.btnInspect.addEventListener('click', () => this.mode = 'inspect');
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

    this.buildings = (this.root.append('g').attr('class', 'buildings') as Selection<SVGGElement, Building, null, undefined>);
    this.outline = this.root.append('rect').attr('class', 'outline'); // TODO maybe should be path for non-rect geometries

    this.redraw();

    fromEvent(window, 'resize').pipe(
      debounceTime(50),
      untilDisconnected(this),
    ).subscribe(() => this.redraw());

    merge(
      fromEvent<MouseEvent>(this.shadowRoot, 'mousemove'),
      fromEvent<MouseEvent>(this.shadowRoot, 'mouseenter'),
      fromEvent<MouseEvent>(this.shadowRoot, 'mouseleave'),
    ).pipe(
      map(e => this.coords(e)),
      distinctUntilChanged(compareCoordinates),
      untilDisconnected(this),
    ).subscribe(at => this.highlightCoords(at));

    merge(
      fromEvent<MouseEvent>(this.shadowRoot, 'mousemove'),
      fromEvent<MouseEvent>(this.shadowRoot, 'mouseenter'),
      fromEvent<MouseEvent>(this.shadowRoot, 'mouseleave'),
    ).pipe(
      map(e => this.buildRegion(e)),
      distinctUntilChanged(compareRegions),
      untilDisconnected(this),
    ).subscribe(region => this.moveOutline(region));

    fromEvent<MouseEvent>(this.shadowRoot, 'click').pipe(
      map(e => this.coords(e)),
      untilDisconnected(this),
    ).subscribe(at => this.handleClick(at));
  }

  public disconnectedCallback(): void { }

  private highlightCoords(at: Coordinates | null): void {
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

  private handleClick(at: Coordinates | null): void {
    if (at) {
      const building = this.grid.buildingAt(at);
      if (this.mode === 'inspect' && !!building) {
        this.inspect(building);
      }

      if (this.mode === 'destroy' && !!building) {
        this.grid.destroy(building);
        this.redrawBuildings();
      }
    } else {
      opacityTransition(0, this.highlights.col);
      opacityTransition(0, this.highlights.row);
    }
  }

  private coords({ offsetX: x, offsetY: y }: MouseEvent): Coordinates | null {
    const side = this.computeTileSide();
    if (
      (x > this.margins.left && x < this.margins.left + this.grid.width * side)
      && (y > this.margins.top && y < this.margins.top + this.grid.height * side)
    ) {
      return { row: Math.floor((y - this.margins.top) / side), col: Math.floor((x - this.margins.left) / side) };
    }

    return null;
  }

  private buildRegion(e: MouseEvent): Region | null {
    if (this.mode === 'build') {
      const tileSide = this.computeTileSide();
      const { width: w, height: h } = this.buildType;
      const idealNW = { x: (e.offsetX - this.margins.left) - (w / 2) * tileSide, y: (e.offsetY - this.margins.top) - (h / 2) * tileSide };
      const closestCol = floor(idealNW.x / tileSide) + Math.ceil((idealNW.x % tileSide) / tileSide - 0.5);
      const closestRow = floor(idealNW.y / tileSide) + Math.ceil((idealNW.y % tileSide) / tileSide - 0.5);
      return { nw: { col: closestCol, row: closestRow }, se: { col: closestCol + w - 1, row: closestRow + h - 1 } };
    }

    return this.grid.buildingAt(this.coords(e)) ?.region;
  }

  private moveOutline(region: Region | null): void {
    if (!region) {
      opacityTransition(0, this.outline);
      return;
    }

    this.outline
      .attr('error', this.mode === 'build' && !(this.buildType === TYPE_ROAD ? this.grid.isFreeForRoad(region) : this.grid.isFree(region)));

    const tileSide = this.computeTileSide();
    opacityTransition(1, this.outline.attr('mode', this.mode));
    snapTransition(this.outline)
      .attr('x', region.nw.col * tileSide)
      .attr('y', region.nw.row * tileSide)
      .attr('width', (region.se.col - region.nw.col + 1) * tileSide)
      .attr('height', (region.se.row - region.nw.row + 1) * tileSide);
  }

  private inspect(building: Building | null): void {
    console.log(building);
  }

  private redraw(): void {
    const tileSide = this.computeTileSide();
    slowTransition(this.root)
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`);

    slowTransition(this.axes.top)
      .call(axisTop(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * tileSide])));

    slowTransition(this.axes.bottom)
      .attr('transform', `translate(0, ${this.grid.height * tileSide})`)
      .call(axisBottom(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * tileSide])));

    slowTransition(this.axes.left)
      .call(axisLeft(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * tileSide])));

    slowTransition(this.axes.right)
      .attr('transform', `translate(${this.grid.width * tileSide}, 0)`)
      .call(axisRight(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * tileSide])));

    slowTransition(this.axes.rows).call(
      axisRight(
        scaleLinear().domain([0, this.grid.height]).range([0, this.grid.height * tileSide]),
      ).tickFormat(() => '').tickSize(this.grid.width * tileSide),
    );

    slowTransition(this.axes.cols).call(
      axisBottom(
        scaleLinear().domain([0, this.grid.width]).range([0, this.grid.width * tileSide]),
      ).tickFormat(() => '').tickSize(this.grid.height * tileSide),
    );

    this.redrawBuildings();
  }

  private redrawBuildings(): void {
    const tileSide = this.computeTileSide();
    slowTransition(
      this.buildings.selectAll<SVGRectElement, Building>('rect')
        .data(this.grid.buildings, d => String(d.id))
        .join('rect')
        .attr('fill', d => d.type.colour.hex()),
    ).attr('x', d => d.region.nw.col * tileSide)
      .attr('y', d => d.region.nw.row * tileSide)
      .attr('width', d => (d.region.se.col - d.region.nw.col + 1) * tileSide)
      .attr('height', d => (d.region.se.row - d.region.nw.row + 1) * tileSide);

    slowTransition(
      this.buildings
        .selectAll<SVGTextElement, Building>('text')
        .data(this.grid.buildings, d => String(d.id))
        .join('text')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'middle')
        .text(d => d.type.name),
    ).attr('x', d => ((d.region.nw.col + d.region.se.col + 1) / 2) * tileSide)
      .attr('y', d => ((d.region.nw.row + d.region.se.row + 1) / 2) * tileSide);
  }

  private computeTileSide(): number {
    const width = this.container.offsetWidth - this.margins.left - this.margins.right;
    const height = this.container.offsetHeight - this.margins.top - this.margins.bottom;

    const cols = this.grid.width;
    const rows = this.grid.height;

    return Math.min(Math.floor(width / cols), Math.floor(height / rows));
  }

}

customElements.define('designer-grid', DesignerGrid);
