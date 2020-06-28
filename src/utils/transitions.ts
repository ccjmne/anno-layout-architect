import { easeExpOut, easeLinear } from 'd3-ease';
import { Selection } from 'd3-selection';
import 'd3-transition';

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function opacityTransition<E extends SVGElement, Datum>(
  opacity: number,
  e: Selection<E, Datum, any, any>,
) {
  return e.transition('opacity').duration(150).ease(easeLinear).attr('opacity', opacity);
}

export function snapTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition().duration(75).ease(easing);
}

export function snapNamedTransition<E extends SVGElement, Datum>(
  name: string,
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition(name).duration(75).ease(easing);
}

export function slowTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition().duration(500).ease(easing);
}

export function slowNamedTransition<E extends SVGElement, Datum>(
  name: string,
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition(name).duration(500).ease(easing);
}
