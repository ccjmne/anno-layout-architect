import { Tile } from './tile.class';
import { Grid, Region } from './grid.class';
import { BuildingType, TYPE_ROAD } from './building-type.class';

let SEQ = 0;

export class Building {

  public readonly id: number;
  public type!: BuildingType;
  public region: Region;

  public parent?: Building;
  public children: Array<Building> = [];

  private tiles: Array<Tile> = []; // TODO: should be dropped?

  constructor(type: BuildingType, parentBuilding?: Building) {
    this.id = SEQ++; // eslint-disable-line no-plusplus
    this.type = type;
    this.children = [];
    if (parentBuilding) {
      this.parent = parentBuilding;
      parentBuilding.children.push(this);
    }
  }

  public placeOn(region: Region, tiles: Tile[]): void {
    this.region = region;
    tiles.forEach(t => t.setBuilding(this));
    this.tiles.push(...tiles);
  }

  public removeFrom(grid: Grid): void {
    this.tiles.forEach(t => t.free());
    this.tiles.splice(0, this.tiles.length);
    this.children.forEach(c => c.removeFrom(grid));
    this.children.splice(0, this.children.length);
    grid.buildings.splice(grid.buildings.indexOf(this), 1);
  }

  public getTiles(): Tile[] {
    return this.tiles;
  }

}

export const BUILDING_ROAD = new Building(TYPE_ROAD);
