import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { scaleLinear, scaleBand } from 'd3-scale';
import { select, Selection } from 'd3-selection';

import { Grid } from '../designer-engine/grid.class';
import { Coordinates } from '../designer-engine/coordinates.class';
import { Building } from '../designer-engine/building.class';
import { TYPE_FARM } from '../designer-engine/building-type.class';

import 'd3-transition';

class DesignerGrid extends HTMLElement {

  // HTML elements
  private container: HTMLElement;
  private btnBuild: HTMLButtonElement;
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
  private mode: 'build' | 'destroy' | 'inspect' = 'destroy';
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
    this.btnBuild = this.shadowRoot.querySelector('button#build');
    this.btnDestroy = this.shadowRoot.querySelector('button#destroy');
    this.btnInspect = this.shadowRoot.querySelector('button#inspect');
    this.btnBuild.addEventListener('click', () => this.mode = 'build');
    this.btnDestroy.addEventListener('click', () => this.mode = 'destroy');
    this.btnInspect.addEventListener('click', () => this.mode = 'inspect');
    this.shadowRoot.querySelector('button#dump').addEventListener('click', () => {
      console.log(this.grid.buildings);
    });

    window.addEventListener('resize', () => this.redraw());
    this.shadowRoot.addEventListener('mousemove', this.hover.bind(this));
    this.shadowRoot.addEventListener('click', this.handleClick.bind(this));

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
  }

  public disconnectedCallback(): void {
    // remove event listeners
  }

  private hover(e: MouseEvent): void {
    const coords = this.coordinatesUnderMouse(e);
    if (coords) {
      const side = this.computeTileSide();
      this.highlights.col.attr('width', side).attr('height', this.grid.height * side)
        .attr('x', coords.col * side)
        .transition('opacity')
        .duration(100)
        .attr('opacity', 0.3);
      this.highlights.row.attr('height', side).attr('width', this.grid.width * side)
        .attr('y', coords.row * side)
        .transition('opacity')
        .duration(100)
        .attr('opacity', 0.3);
      const building = this.grid.buildingAt(coords);

      this.updateOutline(building);
    } else {
      this.highlights.col.transition('opacity').duration(100).attr('opacity', 0);
      this.highlights.row.transition('opacity').duration(100).attr('opacity', 0);
    }
  }

  private handleClick(e: MouseEvent): void {
    const coords = this.coordinatesUnderMouse(e);
    if (coords) {
      const building = this.grid.buildingAt(coords);
      if (this.mode === 'inspect' && !!building) {
        this.inspect(building);
      }
      if (this.mode === 'destroy' && !!building) {
        this.grid.destroy(building);
        this.redrawBuildings();
      }
    } else {
      this.highlights.col.transition('opacity').duration(100).attr('opacity', 0);
      this.highlights.row.transition('opacity').duration(100).attr('opacity', 0);
    }
  }

  private coordinatesUnderMouse({ offsetX: x, offsetY: y }: MouseEvent): Coordinates | null {
    // TODO: use d3-bisect maybe?
    const side = this.computeTileSide();
    if ((x > this.margins.left && x < this.margins.left + this.grid.width * side)
      && (y > this.margins.top && y < this.margins.top + this.grid.height * side)
    ) {
      return { row: Math.floor((y - this.margins.top) / side), col: Math.floor((x - this.margins.left) / side) };
    }

    return null;
  }

  private updateOutline(building: Building | null): void {
    if (!building) {
      this.outline.transition('opacity').duration(100).attr('opacity', 0);
      return;
    }
    const tileSide = this.computeTileSide();
    this.outline.attr('mode', this.mode).transition('opacity').duration(100).attr('opacity', 1);
    this.outline.transition().duration(50)
      .attr('x', building.region.nw.col * tileSide)
      .attr('y', building.region.nw.row * tileSide)
      .attr('width', (building.region.se.col - building.region.nw.col + 1) * tileSide)
      .attr('height', (building.region.se.row - building.region.nw.row + 1) * tileSide);

    switch (this.mode) {

      case 'build':
        break;
      case 'destroy':
        this.redrawBuildings();
        break;
      case 'inspect':
      default:
        this.inspect(building);

    }
  }

  private inspect(building: Building | null): void {
    console.log(building);
  }

  private redraw(): void {
    const tileSide = this.computeTileSide();
    this.root.transition()
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`);

    this.axes.top.transition()
      .call(axisTop(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * tileSide])));

    this.axes.bottom.transition()
      .attr('transform', `translate(0, ${this.grid.height * tileSide})`)
      .call(axisBottom(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * tileSide])));

    this.axes.left.transition()
      .call(axisLeft(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * tileSide])));

    this.axes.right.transition()
      .attr('transform', `translate(${this.grid.width * tileSide}, 0)`)
      .call(axisRight(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * tileSide])));

    this.axes.rows.transition().call(
      axisRight(
        scaleLinear().domain([0, this.grid.height]).range([0, this.grid.height * tileSide]),
      ).tickFormat(() => '').tickSize(this.grid.width * tileSide),
    );

    this.axes.cols.transition().call(
      axisBottom(
        scaleLinear().domain([0, this.grid.width]).range([0, this.grid.width * tileSide]),
      ).tickFormat(() => '').tickSize(this.grid.height * tileSide),
    );

    this.redrawBuildings();
  }

  private redrawBuildings(): void {
    const tileSide = this.computeTileSide();
    this.buildings
      .selectAll('rect')
      .data(this.grid.buildings, (d: Building) => String(d.id))
      .join('rect')
      .attr('fill', d => d.type.colour.hex())
      .transition()
      .attr('x', d => d.region.nw.col * tileSide)
      .attr('y', d => d.region.nw.row * tileSide)
      .attr('width', d => (d.region.se.col - d.region.nw.col + 1) * tileSide)
      .attr('height', d => (d.region.se.row - d.region.nw.row + 1) * tileSide);

    this.buildings
      .selectAll('text')
      .data(this.grid.buildings, (d: Building) => String(d.id))
      .join('text')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'middle')
      .text(d => d.type.name)
      .transition()
      .attr('x', d => ((d.region.nw.col + d.region.se.col + 1) / 2) * tileSide)
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
