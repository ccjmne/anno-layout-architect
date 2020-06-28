import { select, Selection } from 'd3-selection';
import { color } from 'd3-color';
import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { scaleLinear, scaleBand } from 'd3-scale';
import { Grid } from '../designer-engine/grid.class';

import 'd3-transition';

class DesignerGrid extends HTMLElement {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;

  private grid: Grid = new Grid();

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

  private margins = { top: 20, right: 20, bottom: 20, left: 20 };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  public connectedCallback(): void {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.append(document.createTextNode(require('./designer-grid.inline.scss')));
    this.shadowRoot.innerHTML += style.outerHTML + require('./designer-grid.template.html');
    this.svg = select(this.shadowRoot.querySelector('svg'));

    window.addEventListener('resize', () => this.redraw());
    this.shadowRoot.addEventListener('mousemove', this.hover.bind(this));

    this.highlights = {
      row: this.svg.append('rect').datum<number | null>(1)
        .attr('class', 'highlight'),
      col: this.svg.append('rect').datum<number | null>(1)
        .attr('class', 'highlight'),
    };

    this.axes = {
      top: this.svg.append('g')
        .attr('class', 'axis top')
        .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`),
      right: this.svg.append('g')
        .attr('class', 'axis right')
        .attr('transform', `translate(${this.margins.left}, ${this.offsetHeight - this.margins.bottom})`),
      bottom: this.svg.append('g')
        .attr('class', 'axis bottom')
        .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`),
      left: this.svg.append('g')
        .attr('class', 'axis left')
        .attr('transform', `translate(${this.offsetWidth - this.margins.right}, ${this.margins.top})`),
      rows: this.svg.append('g')
        .attr('class', 'axis rows')
        .attr('transform', `translate(${this.margins.right}, ${this.margins.top})`),
      cols: this.svg.append('g')
        .attr('class', 'axis cols')
        .attr('transform', `translate(${this.margins.right}, ${this.margins.top})`),
    };

    this.redraw();
  }

  public disconnectedCallback(): void {
    // remove window's eventListener on resize
  }

  private hover({ offsetX: x, offsetY: y }: MouseEvent): void {
    // TODO: use d3-bisect maybe?
    const side = this.computeTileSide();
    if ((x > this.margins.left && x < this.margins.left + this.grid.width * side)
      && (y > this.margins.top && y < this.margins.top + this.grid.height * side)
    ) {
      const coords = { row: Math.floor((y - this.margins.top) / side), col: Math.floor((x - this.margins.left) / side) };
      this.highlights.col.attr('width', side).attr('height', this.grid.height * side)
        .attr('x', this.margins.left + coords.col * side)
        .attr('y', this.margins.top)
        .transition('opacity')
        .duration(100)
        .attr('opacity', 0.3);
      this.highlights.row.attr('height', side).attr('width', this.grid.width * side)
        .attr('x', this.margins.left)
        .attr('y', this.margins.top + coords.row * side)
        .transition('opacity')
        .duration(100)
        .attr('opacity', 0.3);
    } else {
      this.highlights.col.transition('opacity').duration(100).attr('opacity', 0);
      this.highlights.row.transition('opacity').duration(100).attr('opacity', 0);
    }
  }

  private redraw(): void {
    const tileSide = this.computeTileSide();
    this.axes.top.transition()
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`)
      .call(axisTop(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * tileSide])));
    this.axes.bottom.transition()
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top + this.grid.height * tileSide})`)
      .call(axisBottom(scaleBand()
        .domain(Array.from({ length: this.grid.width }, (_, i) => String(i)))
        .range([0, this.grid.width * tileSide])));
    this.axes.left.transition()
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`)
      .call(axisLeft(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * tileSide])));
    this.axes.right.transition()
      .attr('transform', `translate(${this.margins.left + this.grid.width * tileSide}, ${this.margins.top})`)
      .call(axisRight(scaleBand()
        .domain(Array.from({ length: this.grid.height }, (_, i) => String(i)))
        .range([0, this.grid.height * tileSide])));
    this.axes.rows.transition()
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`)
      .call(
        axisRight(
          scaleLinear()
            .domain([0, this.grid.height])
            .range([0, this.grid.height * tileSide]),
        ).tickFormat(() => '').tickSize(this.grid.width * tileSide),
      );
    this.axes.cols.transition()
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`)
      .call(
        axisBottom(
          scaleLinear()
            .domain([0, this.grid.width])
            .range([0, this.grid.width * tileSide]),
        ).tickFormat(() => '').tickSize(this.grid.height * tileSide),
      );
  }

  private computeTileSide(): number {
    const width = this.offsetWidth - this.margins.left - this.margins.right;
    const height = this.offsetHeight - this.margins.top - this.margins.bottom;

    const cols = this.grid.width;
    const rows = this.grid.height;

    return Math.min(Math.floor(width / cols), Math.floor(height / rows));
  }
}

customElements.define('designer-grid', DesignerGrid);
