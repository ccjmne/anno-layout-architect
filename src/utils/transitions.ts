import { easeExpOut, easeLinear } from 'd3-ease';
import { Selection, local, select } from 'd3-selection';

import 'd3-transition';

const DURATION_SNAP = 75;
const DURATION_REGULAR = 150;
const DURATION_SLOW = 500;

const SPLIT_PROPERTIES = /\s+(?=translate|rotate|scale)/;
const SPLIT_KEY_VALUE = /(?<=translate|rotate|scale)\s*(?=\()/;

function parse(transformStr: string): Partial<Record<'translate' | 'rotate' | 'scale', string>> {
  return transformStr
    .trim()
    .split(SPLIT_PROPERTIES)
    .map(key => key.split(SPLIT_KEY_VALUE))
    .filter(({ length }) => length === 2)
    .reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {});
}

export function mergeTransforms<E extends Element>(node: E, transformAttr: string) {
  return Object.entries({
    ...parse(node.getAttribute('transform') || ''),
    ...parse(transformAttr),
  }).reduce((res, [k, v]) => `${res} ${k}${v}`, '').trim();
}

const ROTATION_CENTER = local<{ x: number, y: number }>();
// const ALREADY_EXITING = local<boolean>();

export function opacityTransition<E extends SVGElement, Datum>(
  opacity: number,
  e: Selection<E, Datum, any, any>,
) {
  return e.transition('opacity').duration(DURATION_REGULAR).ease(easeLinear).attr('opacity', opacity);
}

export function exitTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
): void {
  e.each(function () {
    // if (ALREADY_EXITING.get(this)) {
    //   return;
    // }
    //
    // ALREADY_EXITING.set(this, true);
    opacityTransition(0, select(this));
    select(this).transition('exit').duration(DURATION_SNAP).ease(easeExpOut)
      .attr('transform', function () { return mergeTransforms(this, 'scale(1.1)'); })
      .transition()
      .attr('transform', function () { return mergeTransforms(this, 'scale(.5)'); })
      .remove();
  });
}

export function enterTransition<E extends SVGGraphicsElement, Datum>(
  e: Selection<E, Datum, any, any>,
) {
  opacityTransition(1, e);
  return e.call(en => en.attr('opacity', 0))
    .transition('enter').duration(DURATION_SNAP).ease(easeExpOut)
    .attr('transform', function () { return mergeTransforms(this, 'scale(1.1)'); })
    .transition()
    .attr('transform', function () { return mergeTransforms(this, 'scale(1)'); });
}

export function errorTransition<E extends SVGGraphicsElement, Datum>(
  span: number,
  e: Selection<E, Datum, any, any>,
) {
  return e
    .transition('error').duration(DURATION_SNAP).ease(easeExpOut).attr('transform', function () {
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

export function snapTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition().duration(DURATION_SNAP).ease(easing);
}

export function snapNamedTransition<E extends SVGElement, Datum>(
  name: string,
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition(name).duration(DURATION_SNAP).ease(easing);
}

export function slowTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition().duration(DURATION_SLOW).ease(easing);
}

export function slowNamedTransition<E extends SVGElement, Datum>(
  name: string,
  e: Selection<E, Datum, any, any>,
  easing: (normalizedTime: number) => number = easeExpOut,
) {
  return e.transition(name).duration(DURATION_SLOW).ease(easing);
}
