import { easeExpOut, easeLinear } from 'd3-ease';
import { Selection, select } from 'd3-selection';
import 'd3-transition';

import { Geometrised } from 'src/designer-grid/designer-grid.element';

import { randomInt } from './maths';

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

// TODO: maybe drop this and its usages
export function mergeTransforms<E extends Element>(node: E, transformAttr: string) {
  return Object.entries({
    ...parse(node.getAttribute('transform') || ''),
    ...parse(transformAttr),
  }).reduce((res, [k, v]) => `${res} ${k}${v}`, '').trim();
}

export function opacityTransition<E extends SVGElement, Datum>(
  opacity: number,
  e: Selection<E, Datum, any, any>,
) {
  return e.transition('opacity').duration(DURATION_REGULAR).ease(easeLinear).attr('opacity', opacity);
}

export function exitTransition<E extends SVGElement, Datum>(
  e: Selection<E, Datum, any, any>,
): void {
  e.each(function () { // each exiting element should have its own transition
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

export function successTransition<E extends SVGElement, Datum>(
  amplitude: number,
  e: Selection<E, Geometrised<Datum>, any, any>,
) {
  return e.transition('success')
    .duration(DURATION_SNAP)
    .ease(easeExpOut)
    // TODO: Prefer using a SINGLE transition w/ a attrTween instead of chained ones
    .attr('transform', function ({ geo: { w, h } }) { return mergeTransforms(this, `scale(${(w - amplitude) / w} ${(h - amplitude) / h})`); })
    .transition()
    .attr('transform', function () { return mergeTransforms(this, 'scale(1)'); });
}

export function errorTransition<E extends SVGElement, Datum>(
  amplitude: number,
  e: Selection<E, Datum, any, any>,
) {
  return e
    .transition('error')
    .duration(DURATION_REGULAR)
    .ease(easeExpOut)
    .attrTween('transform', function () {
      return t => mergeTransforms(
        this,
        `translate(${Math.sin(randomInt(5, 10) * t * Math.PI) * amplitude} ${Math.sin(randomInt(5, 10) * t * Math.PI) * amplitude})`,
      );
    });
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
