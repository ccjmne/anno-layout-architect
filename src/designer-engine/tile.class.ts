import { Building } from './building.class';

// TODO: this class is... useless 😱
export class Tile {

  private _building: Building | null;
  public get building() {
    return this._building;
  }

  constructor(building?: Building) {
    this._building = building;
  }

  public free(): void {
    // this._building.free([this]);
    this._building = null;
  }

  public setBuilding(building: Building) {
    if (this._building) {
      this.free();
    }

    this._building = building;
  }

}
