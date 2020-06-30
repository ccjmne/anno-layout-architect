import { BuildingType, TYPE_ROAD } from './building-type.class';
import { Grid, Region } from './grid.class';

let SEQ = 0;

export class Building {

  public readonly id: number;
  public type!: BuildingType;
  public region: Region | null = null;

  public parent?: Building;
  public children: Array<Building> = [];

  constructor(type: BuildingType, parent?: Building) {
    this.id = SEQ++; // eslint-disable-line no-plusplus
    this.type = type;
    this.children = [];
    if (parent) {
      this.parent = parent;
      parent.children.push(this);
    }
  }

  public moveTo(region: Region): void {
    this.region = region;
  }

  public removeFrom(grid: Grid): void {
    this.children.forEach(c => c.removeFrom(grid));
    this.children.splice(0, this.children.length);
    grid.buildings.splice(grid.buildings.indexOf(this), 1);
  }

}

export const BUILDING_ROAD = new Building(TYPE_ROAD);
