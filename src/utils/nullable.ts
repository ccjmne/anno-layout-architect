export type Nullable<T> = T | null;

export function exists(v: Nullable<any>): boolean {
  return v !== null && typeof v !== 'undefined';
}

export function not(v: Nullable<any>): boolean {
  return v === null || typeof v === 'undefined';
}
