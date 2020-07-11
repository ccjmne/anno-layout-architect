import { TileCoords, ORIENTATION, Region, computeRegion } from 'src/designer-engine/definitions';

import { BuildingType } from './definitions';

export class Building {

  private static SEQ: number = 0;

  public readonly id: number; // TODO: maybe can't be deleted, 'cause it'll be used in later versions of EncoderDecoder

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
