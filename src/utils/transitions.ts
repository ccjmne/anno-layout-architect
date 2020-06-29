import { easeExpOut, easeLinear } from 'd3-ease';
import { Selection, local } from 'd3-selection';
import 'd3-transition';

const ROTATION_CENTER = local<{ x: number, y: number }>();

export function errorTransition<E extends SVGGraphicsElement, Datum>(
  span: number,
  e: Selection<E, Datum, any, any>,
) {
  /* eslint-disable func-names */
  return e
    .transition('error').duration(75).ease(easeExpOut).attr('transform', function () {
      const { x, y, width, height } = this.getBBox();
      ROTATION_CENTER.set(this, { x: x + width / 2, y: y + height + span });
      return `translate(-${span / 2}) rotate(-5 ${ROTATION_CENTER.get(this).x} ${ROTATION_CENTER.get(this).y})`;
    })
    .transition()
    .attr('transform', function () {
      return `translate(${span / 2}) rotate(5 ${ROTATION_CENTER.get(this).x} ${ROTATION_CENTER.get(this).y})`;
    })
    .transition()
    .attr('transform', function () {
      return `translate(-${span / 2}) rotate(-5 ${ROTATION_CENTER.get(this).x} ${ROTATION_CENTER.get(this).y})`;
    })
    .transition()
    .attr('transform', `translate(0) rotate(0)`);
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
