import { ORIENTATION } from 'src/designer-engine/definitions';

// TODO: should exist as a Map<number, BuildingType> probably
export const BUILDING_TYPES: BuildingType[] = require('../../assets/building-types.json') as BuildingType[];

export function typeFor(id: number): BuildingType {
  return BUILDING_TYPES.find(({ id: i }) => id === i);
}

export function rotate({ w, h }: { w: number, h: number }, orientation: ORIENTATION = ORIENTATION.HORIZONTAL): { w: number, h: number } {
  return orientation === ORIENTATION.HORIZONTAL ? { w, h } : { w: h, h: w };
}

export type BuildingType = {
  id: number; // id ∈ [0, 255] // TODO: should be string, probably
  name: string;
  colour: string;
  icon: string;
  w: number;
  h: number;
}
