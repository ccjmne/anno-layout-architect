import { color, Color } from 'd3-color';

import { Region } from './definitions';
import { Grid } from './grid.class';

export const TYPE_FARM: BuildingType = { colour: color('darkorange'), name: 'Farm', width: 3, height: 2 };
export const TYPE_ROAD: BuildingType = { colour: color('grey'), name: '', width: 1, height: 1 };

let SEQ = 0;

export type BuildingType = {
  name: string;
  colour: Color;
  width: number;
  height: number;
}

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
