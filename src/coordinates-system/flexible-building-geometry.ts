import { TileCoords, compareTileCoords } from 'src/designer-engine/definitions';
import { FlexibleBuildingShape } from 'src/designer-engine/flexible-building.class';

enum Edge { TOP, BOTTOM, LEFT, RIGHT }

const CLOCKWISE: Edge[] = [Edge.TOP, Edge.RIGHT, Edge.BOTTOM, Edge.LEFT, Edge.TOP, Edge.RIGHT, Edge.BOTTOM, Edge.LEFT];
function counterClockwise(edge: Edge): Edge {
  return CLOCKWISE[(CLOCKWISE.length + CLOCKWISE.indexOf(edge) - 1) % CLOCKWISE.length];
}

// e.g.: skirting along the TOP edge means going to the tile immediately to the RIGHT
function nextTile({ col, row }: TileCoords, skirting?: Edge): TileCoords {
  return {
    [Edge.TOP]: { col: col + 1, row },
    [Edge.BOTTOM]: { col: col - 1, row },
    [Edge.LEFT]: { col, row: row - 1 },
    [Edge.RIGHT]: { col, row: row + 1 },
  }[skirting];
}

class Edges {

  public [Edge.TOP]: boolean;
  public [Edge.BOTTOM]: boolean;
  public [Edge.LEFT]: boolean;
  public [Edge.RIGHT]: boolean;

  constructor({ col, row }: TileCoords, { grid, cols, rows }: FlexibleBuildingShape) {
    if (grid[row][col] === false) {
      return;
    }

    [
      [Edge.TOP, col, row - 1] as [Edge, number, number],
      [Edge.BOTTOM, col, row + 1] as [Edge, number, number],
      [Edge.LEFT, col - 1, row] as [Edge, number, number],
      [Edge.RIGHT, col + 1, row] as [Edge, number, number],
    ].forEach(([dir, c, r]) => (this[dir] = !(c >= 0 && c < cols && r >= 0 && r < rows && grid[r][c])));
  }

  public remove(edge: Edge): void {
    delete this[edge];
  }

}

export class FlexibleBuildingPath {

  private readonly grid: Edges[][];
  private readonly tileSide: number;

  private d: string;

  // buffer commands of the same kind
  private last: string;
  private buffer: number = 0;

  constructor(shape: FlexibleBuildingShape, tileSide: number) {
    this.grid = shape.grid.map((r, row) => r.map((_, col) => new Edges({ row, col }, shape)));
    this.tileSide = tileSide;
  }

  public compute(): string {
    this.clear();
    this.grid.map((r, row) => r.map((_, col) => this.findSegment({ row, col })).join('')).join('');
    return this.d;
  }

  private findSegment(start: TileCoords): void {
    if (!this.grid[start.row][start.col][CLOCKWISE[0]]) {
      return;
    }

    this.beginSegment(start);
    let skirting: Edge = CLOCKWISE[0];
    let next: TileCoords = start;
    do {
      next = nextTile(next, skirting = this.skirt(next, skirting));
    } while (next && !compareTileCoords(next, start));

    if (next) { // close up the path, unless there's no next tile (for single-tile contours)
      this.skirt(next, skirting);
    }

    this.completeSegment();
  }

  private skirt({ row, col }: TileCoords, skirting: Edge): Edge | null {
    /* eslint-disable no-restricted-syntax */
    for (const edge of CLOCKWISE.slice(CLOCKWISE.indexOf(skirting), 4 + CLOCKWISE.indexOf(skirting))) {
      if (!this.trySkirting(this.grid[row][col], edge)) {
        return counterClockwise(edge); // interrupt looking for borders and return next tile to visit
      }
    }

    // If we're here, we've gone full-circle: it was a single-tile contours, there's no edge to skirt into the next tile
    return null;
  }

  // Return `false` iff no such edge at given location
  // e.g.: following the TOP edge means drawing a HORIZONTAL line to the RIGHT
  private trySkirting(tile: Edges, edge: Edge): boolean {
    if (!tile[edge]) {
      return false;
    }

    switch (edge) {
      case Edge.TOP:
        this.bufferCommand('h', this.tileSide);
        break;
      case Edge.BOTTOM:
        this.bufferCommand('h', -this.tileSide);
        break;
      case Edge.LEFT:
        this.bufferCommand('v', -this.tileSide);
        break;
      case Edge.RIGHT:
        this.bufferCommand('v', this.tileSide);
        break;
      default: // can't happen
    }

    tile.remove(edge); // remove edges drawn
    return true;
  }

  private clear() {
    this.d = '';
  }

  private bufferCommand(cmd: string, value: number): void {
    if (this.last === cmd) {
      this.buffer += value;
      return;
    }

    if (this.last) {
      this.d += `${this.last}${this.buffer}`;
    }

    this.last = cmd;
    this.buffer = value;
  }

  private beginSegment({ row, col }: TileCoords): void {
    this.last = null;
    this.buffer = 0;
    this.d += `M${col * this.tileSide},${row * this.tileSide}`;
  }

  private completeSegment(): void {
    this.d += `z\n`;
  }

}
