import { Region, ORIENTATION } from './definitions';

export const BUILDING_TYPES: BuildingType[] = require('../../assets/building-types.json') as BuildingType[];

export function rotate({ w, h }: { w: number, h: number }, orientation: ORIENTATION = ORIENTATION.HORIZONTAL): { w: number, h: number } {
  return orientation === ORIENTATION.HORIZONTAL ? { w, h } : { w: h, h: w };
}

export type BuildingType = {
  id: number; // id ∈ [0, 255]
  name: string;
  colour: string;
  icon: string;
  w: number;
  h: number;
}

export class Building {

  private static SEQ: number = 0;

  public readonly id: number;
  public type!: BuildingType;
  public region: Region | null = null;

  // TODO: maybe should be actual property
  // TODO: maybe grid should take a BuildingType and ORIENTATION, maybe 'region' should only be computed on request
  public get orientation(): ORIENTATION {
    return this.region && this.region.se.col - this.region.nw.col + 1 < this.region.se.row - this.region.nw.row + 1
      ? ORIENTATION.VERTICAL
      : ORIENTATION.HORIZONTAL;
  }

  public parent?: Building;
  public children: Array<Building> = [];

  constructor(type: BuildingType, parent?: Building) {
    this.id = Building.SEQ++; // eslint-disable-line no-plusplus
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
