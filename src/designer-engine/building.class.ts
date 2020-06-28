import { Tile } from './tile.class';
import { Grid } from './grid.class';

export class Building {
  public name!: string;

  private tiles: Array<Tile> = [];

  public parentBuilding?: Building;

  public children: Array<Building> = [];

  constructor(name: string, parentBuilding?: Building) {
    this.name = name;
    this.children = [];
    if (parentBuilding) {
      this.parentBuilding = parentBuilding;
      parentBuilding.children.push(this);
    }
  }

  public placeOn(tiles: Tile[]): void {
    tiles.forEach(t => t.setBuilding(this));
    this.tiles.push(...tiles);
  }

  public removeFrom(grid: Grid): void {
    this.tiles.forEach(t => t.free());
    this.tiles.splice(0, this.tiles.length);
    this.children.forEach(c => c.removeFrom(grid));
    this.children.splice(0, this.children.length);
    grid.buildings.delete(this);
  }

  public getTiles(): Tile[] {
    return this.tiles;
  }
}

export const BUILDING_ROAD = new Building('Road');
