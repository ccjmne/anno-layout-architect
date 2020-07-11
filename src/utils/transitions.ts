import { easeExpOut, easeLinear } from 'd3-ease';
import { Selection, select } from 'd3-selection';
import 'd3-transition'; // eslint-disable-line import/no-duplicates
import { Transition } from 'd3-transition'; // eslint-disable-line import/no-duplicates

import { Geometrised } from 'src/coordinates-system/definitions';

import { randomInt } from './maths';

export enum DURATION {
  SNAP = 75,
  REGULAR = 150,
  SLOW = 500,
}

export function crispEdgeAfter<E extends SVGElement>(t: Transition<E, any, any, any>): Transition<E, any, any, any> {
  t.nodes().forEach(n => n.style.setProperty('shape-rendering', 'geometricPrecision'));
  t.end().then(() => t.nodes().forEach(n => n.style.setProperty('shape-rendering', 'crispEdges')), () => { } /* discard rejections */);
  return t;
}

export function opacityTransition<E extends SVGElement, Datum>(
  opacity: number,
  e: Selection<E, Datum, any, any>,
) {
  return e.transition('opacity').duration(DURATION.REGULAR).ease(easeLinear).attr('opacity', opacity);
}

export function exitTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
): void {
  e.each(function () { // each exiting element should have its own transition
    opacityTransition(0, select(this));
    select(this).transition('exit').duration(DURATION.SNAP).ease(easeExpOut)
      .attr('transform', 'scale(1.1)')
      .transition()
      .attr('transform', 'scale(.5)')
      .remove();
  });
}

export function successTransition<E extends SVGElement, Datum>(
  amplitude: number,
  e: Selection<E, Geometrised<Datum>, any, any>,
) {
  return e.transition('success')
    .duration(DURATION.REGULAR)
    .ease(easeExpOut)
    .attrTween('transform', ({ geo: { w, h } }) => t => `scale(${(w - Math.sin(Math.PI * t) * amplitude) / w} ${(h - Math.sin(Math.PI * t) * amplitude) / h})`);
}

export function errorTransition<E extends SVGElement, Datum>(
  amplitude: number,
  e: Selection<E, Datum, any, any>,
) {
  return e
    .transition('error')
    .duration(DURATION.REGULAR)
    .ease(easeExpOut)
    .attrTween('transform', () => t => `translate(${Math.sin(randomInt(5, 10) * t * Math.PI) * amplitude} ${Math.sin(randomInt(5, 10) * t * Math.PI) * amplitude})`);
}

export function transition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
  duration: number = DURATION.REGULAR,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition().duration(duration).ease(easing);
}

export function namedTransition<E extends SVGElement, Datum>(
  name: string,
  e: Selection<E, Datum, any, any>,
  duration: number = DURATION.REGULAR,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition(name).duration(duration).ease(easing);
}

export function snapTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition().duration(DURATION.SNAP).ease(easing);
}

export function snapNamedTransition<E extends SVGElement, Datum>(
  name: string,
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition(name).duration(DURATION.SNAP).ease(easing);
}

export function slowTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition().duration(DURATION.SLOW).ease(easing);
}

export function slowNamedTransition<E extends SVGElement, Datum>(
  name: string,
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition(name).duration(DURATION.SLOW).ease(easing);
}
