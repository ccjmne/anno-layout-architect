import { Observable, ReplaySubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type CustomElement = { disconnectedCallback(): void };
type Decorated = CustomElement & { __elementDiconnected$?: Observable<true> };

export function disconnected(element: CustomElement): Observable<true> {
  const decorated = element as Decorated;
  if (decorated.__elementDiconnected$) {
    return decorated.__elementDiconnected$;
  }

  const previousCallback = element.disconnectedCallback;
  const stop$ = new ReplaySubject<true>();
  decorated.disconnectedCallback = () => {
    if (previousCallback) {
      previousCallback.apply(element);
    }

    stop$.next(true);
    stop$.complete();
  };

  return decorated.__elementDiconnected$ = stop$.asObservable();
}

export function untilDisconnected<T>(element: CustomElement): (source: Observable<T>) => Observable<T> {
  return (source: Observable<T>) => source.pipe(takeUntil(disconnected(element)));
}
