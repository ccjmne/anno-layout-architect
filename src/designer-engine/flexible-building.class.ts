import { Building, BuildingType } from './building.class';
import { Region } from './definitions';

export class FlexibleBuildingShape {

  public grid: boolean[][];
  public cols: number;
  public rows: number;

  constructor(grid: boolean[][]) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = this.rows ? grid[0].length : 0; // probably won't ever happen that the grid be 0x0.
  }

}

export class FlexibleBuilding {

  public readonly type!: BuildingType;

  public region: Region;
  public shape: FlexibleBuildingShape;
  public parent?: Building;

  constructor(type: BuildingType, region: Region, shape: FlexibleBuildingShape, parent?: Building) {
    this.type = type;
    this.region = region;
    this.shape = shape;
    this.parent = parent;
  }

  public reshape(region: Region, shape: FlexibleBuildingShape): void {
    this.region = region;
    this.shape = shape;
  }

}
