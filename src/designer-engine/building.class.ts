import { color, Color } from 'd3-color';

import { Region } from './definitions';

export const TYPE_FARM: BuildingType = { colour: color('darkorange'), name: 'Farm', width: 3, height: 2 };
export const TYPE_ROAD: BuildingType = { colour: color('grey'), name: '', width: 1, height: 1 };

let SEQ = 0;

export enum ORIENTATION {
  HORIZONTAL,
  VERTICAL,
}

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

  // TODO: return type should be ORIENTATION
  // TODO: should be actual property
  // TODO: actually, grid should take a BuildingType and ORIENTATION, 'region' should only be computed on request, through a getter perhaps.

  public get orientation(): boolean {
    return this.region && (this.region.se.col - this.region.nw.col + 1) < this.region.se.row - this.region.nw.row + 1;
  }

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

}

export const BUILDING_ROAD = new Building(TYPE_ROAD);
