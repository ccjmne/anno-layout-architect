import { Color, color } from 'd3-color';

export class BuildingType {

  public readonly name: string;
  public readonly colour: Color;
  public readonly width: number;
  public readonly height: number;

}

export const TYPE_FARM: BuildingType = { colour: color('teal'), name: 'Farm', width: 3, height: 2 };
export const TYPE_ROAD: BuildingType = { colour: color('grey'), name: '', width: 1, height: 1 };
