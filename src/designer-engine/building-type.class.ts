import { Color, color } from 'd3-color';

export class BuildingType {

  public readonly name: string;
  public readonly colour: Color;

}

export const TYPE_FARM: BuildingType = { colour: color('teal'), name: 'Farm' };
export const TYPE_ROAD: BuildingType = { colour: color('grey'), name: '' };
