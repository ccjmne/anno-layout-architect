import { TileCoords, ORIENTATION, Region, computeRegion } from 'src/designer-engine/definitions';

import { BuildingType } from './definitions';

export class Building {

  private static SEQ: number = 0;

  // Can't be deleted: used to uniquely identify buildings in D3 selections...
  public readonly id: number;

  public type!: BuildingType;
  public orientation: ORIENTATION;
  public at: TileCoords;
  public region: Region;

  public parent?: Building;
  public children: Array<Building> = [];

  constructor(type: BuildingType, at: TileCoords, orientation: ORIENTATION, parent?: Building) {
    this.id = Building.SEQ++; // eslint-disable-line no-plusplus
    this.type = type;
    this.move(at, orientation);

    if (parent) {
      this.parent = parent;
      parent.children.push(this);
    }
  }

  public move(to: TileCoords, orientation: ORIENTATION) {
    this.at = to;
    this.orientation = orientation;
    this.region = computeRegion(this.type, this.at, this.orientation);
  }

}
