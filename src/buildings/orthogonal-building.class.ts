import { OrthogonalPath } from 'src/coordinates-system/orthogonal-path';

import { Region } from 'src/designer-engine/definitions';

import { Building } from './building.class';
import { BuildingType } from './definitions';

export class OrthogonalShape {

  public grid: boolean[][];
  public cols: number;
  public rows: number;

  constructor(grid: boolean[][]) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = this.rows ? grid[0].length : 0; // probably won't ever happen that the grid be 0x0.
  }

}

export class OrthogonalBuilding {

  private static SEQ: number = 0;

  // Can't be deleted: used to uniquely identify buildings in D3 selections...
  public readonly id: number;

  public readonly type!: BuildingType;
  public region: Region;
  public shape: OrthogonalShape;
  public path: OrthogonalPath;
  public parent?: Building;

  constructor(type: BuildingType, region: Region, shape: OrthogonalShape, parent?: Building) {
    this.id = OrthogonalBuilding.SEQ++; // eslint-disable-line no-plusplus
    this.type = type;
    this.parent = parent;
    this.reshape(region, shape);
  }

  public reshape(region: Region, shape: OrthogonalShape): void {
    this.region = region;
    this.shape = shape;
    this.path = new OrthogonalPath(shape);
  }

}
