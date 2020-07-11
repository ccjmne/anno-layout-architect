import { Observable } from 'rxjs/internal/Observable';
import { ReplaySubject } from 'rxjs/internal/ReplaySubject';
import { Subject } from 'rxjs/internal/Subject';
import { combineLatest } from 'rxjs/internal/observable/combineLatest';
import { distinctUntilChanged } from 'rxjs/internal/operators/distinctUntilChanged';
import { filter } from 'rxjs/internal/operators/filter';
import { map } from 'rxjs/internal/operators/map';
import { tap } from 'rxjs/internal/operators/tap';

import { Building } from 'src/buildings/building.class';
import { BUILDING_TYPES, BuildingType, rotate } from 'src/buildings/definitions';
import { Point } from 'src/coordinates-system/definitions';
import { Region, compareRegions, ORIENTATION } from 'src/designer-engine/definitions';
import { Grid } from 'src/designer-engine/grid.class';
import { not, exists } from 'src/utils/nullable';

import { CoordinatesSystem } from '../coordinates-system/coordinates-system';

export enum ActionValidity { VALID, INVALID, UNAVAILABLE }
export enum ActionType { // string values are referenced in css
  INSPECT = 'INSPECT',
  BUILD = 'BUILD',
  DESTROY = 'DESTROY',
  COPY = 'COPY',
  MOVE_PICK = 'MOVE_PICK',
  MOVE_COMPLETE = 'MOVE_COMPLETE',
}

export type Action = { type: ActionType, validity: ActionValidity, region: Region | null, building?: Building };

function compareActions(a: Action | null, b: Action | null): boolean {
  return not(a) ? not(b) : exists(b) && a.type === b.type && a.validity === b.validity && compareRegions(a.region, b.region);
}

export class ActionsManager {

  // Outputs
  public get modeChanges$(): Observable<ActionType> { return this.mode$.pipe(distinctUntilChanged()); }
  public readonly update$: Observable<Action>;
  public readonly perform$: Observable<Action>;

  // Inputs
  private coords: CoordinatesSystem;
  private grid: Grid;

  // Internals
  // TODO: should probably have mode$ be a BehaviorSubject and get this from this.mode$.value, but BehaviorSubjects are currently bugged
  // See https://github.com/ReactiveX/rxjs/issues/5105
  private readonly mode$: Subject<ActionType> = new ReplaySubject(1);
  private mode: ActionType = ActionType.INSPECT;

  // for BUILD and MOVE_COMPLETE
  // TODO: remove need for initialisation?
  private readonly BUILD: { type: BuildingType, orientation: ORIENTATION } = {
    type: BUILDING_TYPES[0], orientation: ORIENTATION.HORIZONTAL,
  };

  private readonly MOVE: { building: Building | null } = { building: null };

  // Cursor Observables
  private readonly revalidate$: Subject<null> = new Subject();
  private readonly mousemove$: Subject<Point> = new Subject();
  private readonly click$: Subject<Point> = new Subject();
  private readonly rightclick$: Subject<Point> = new Subject();
  private readonly dragstart$: Subject<Point> = new Subject();

  constructor(coords: CoordinatesSystem, grid: Grid) {
    this.coords = coords;
    this.grid = grid;

    combineLatest([
      this.mousemove$,
      this.revalidate$,
    ]).pipe(
      map(([xy]) => this.validateAction(xy)),
      distinctUntilChanged(compareActions),
      // untilDisconnected(this), // TODO: maybe just make everything a CustomElement to leverage lifecycle hooks
    ).subscribe(this.update$ = new Subject());

    this.click$.pipe(
      map(xy => this.validateAction(xy)),
      tap(action => this.performAction(action)),
      // untilDisconnected(this), // TODO: maybe just make everything a CustomElement to leverage lifecycle hooks
    ).subscribe(this.perform$ = new Subject());

    this.dragstart$.pipe(
      filter(() => this.mode === ActionType.INSPECT || this.mode === ActionType.MOVE_PICK),
      map(xy => this.grid.buildingAt(this.coords.toTileCoords(xy))),
      filter(building => !!building),
      // untilDisconnected(this), // TODO: maybe just make everything a CustomElement to leverage lifecycle hooks
    ).subscribe(building => {
      this.MOVE.building = building;
      this.BUILD.orientation = building.orientation;
      this.changeMode(ActionType.MOVE_COMPLETE);
    });

    this.rightclick$.pipe(
      // untilDisconnected(this), // TODO: maybe just make everything a CustomElement to leverage lifecycle hooks
    ).subscribe(() => {
      this.changeMode(ActionType.INSPECT);
    });

    this.modeChanges$.pipe(
      // untilDisconnected(this), // TODO: maybe just make everything a CustomElement to leverage lifecycle hooks
    ).subscribe(mode => {
      if (mode === ActionType.INSPECT) {
        this.coords.updateNow();
      }

      this.revalidate();
    });

    this.changeMode(ActionType.INSPECT);
  }

  public startBuilding(type: BuildingType) {
    this.BUILD.type = type;
    this.changeMode(ActionType.BUILD);
  }

  public mousemove(xy: Point): void {
    this.mousemove$.next(xy);
  }

  public click(xy: Point): void {
    this.click$.next(xy);
  }

  public rightclick(xy: Point): void {
    this.rightclick$.next(xy);
  }

  public dragstart(xy: Point): void {
    this.dragstart$.next(xy);
  }

  private changeMode(mode: ActionType): void {
    this.mode$.next(this.mode = mode);
  }

  private validateAction(xy: Point): Action {
    if (this.mode === ActionType.BUILD) {
      const region = this.coords.snapToGrid(xy, rotate(this.BUILD.type, this.BUILD.orientation));

      // TODO: Allow building road-ish on road-ish?
      return {
        type: ActionType.BUILD,
        validity: this.grid.isFree(region/* , { road: this.BUILD.type === TYPE_ROAD } */) ? ActionValidity.VALID : ActionValidity.INVALID,
        region,
      };
    }

    if (this.mode === ActionType.MOVE_COMPLETE) {
      const { building } = this.MOVE;
      const region = this.coords.snapToGrid(xy, rotate(building.type, this.BUILD.orientation));

      // TODO: Allow moving road-ish on road-ish?
      return {
        type: ActionType.MOVE_COMPLETE,
        validity: this.grid.isFree(region, { /* road: building.type === TYPE_ROAD, */ ignore: building })
          ? ActionValidity.VALID
          : ActionValidity.INVALID,
        region,
        building,
      };
    }

    const building = this.grid.buildingAt(this.coords.toTileCoords(xy));
    return { type: this.mode, validity: building ? ActionValidity.VALID : ActionValidity.UNAVAILABLE, region: building ?.region, building };
  }

  private performAction({ type, validity, region, building }: Action): void {
    if (validity === ActionValidity.UNAVAILABLE) {
      return;
    }

    if (validity === ActionValidity.INVALID) {
      return;
    }

    switch (type) {
      case ActionType.INSPECT:
        console.log('inspect', building);
        break;
      case ActionType.BUILD:
        this.grid.place(this.BUILD.type, region.nw, this.BUILD.orientation);
        break;
      case ActionType.DESTROY:
        this.grid.remove(building);
        break;
      case ActionType.COPY:
        this.BUILD.type = building.type;
        this.BUILD.orientation = building.orientation;
        this.changeMode(ActionType.BUILD);
        break;
      case ActionType.MOVE_PICK:
        this.MOVE.building = building;
        this.BUILD.orientation = building.orientation;
        this.changeMode(ActionType.MOVE_COMPLETE);
        break;
      case ActionType.MOVE_COMPLETE:
        this.grid.move(building, region.nw, this.BUILD.orientation);
        this.changeMode(ActionType.MOVE_PICK);
        break;
      default: return;
    }

    this.revalidate();
  }

  public keypress({ key }: KeyboardEvent): void {
    switch (key.toLowerCase()) {
      case '.':
      case ',':
      case 'q':
      case 'e':
        this.BUILD.orientation = this.BUILD.orientation === ORIENTATION.HORIZONTAL ? ORIENTATION.VERTICAL : ORIENTATION.HORIZONTAL;
        this.revalidate();
        break;
      case 'b':
        this.changeMode(ActionType.BUILD);
        break;
      case 'c':
        this.changeMode(ActionType.COPY);
        break;
      case 'd':
        this.changeMode(ActionType.DESTROY);
        break;
      case 'm':
        this.changeMode(ActionType.MOVE_PICK);
        break;
      case 's':
        // TODO: automatically select "ROAD" type;
        // this.BUILD.type = TYPE_ROAD;
        this.changeMode(ActionType.BUILD);
        break;
      case 'escape':
        this.changeMode(ActionType.INSPECT);
        break;
      default:
    }
  }

  private revalidate(): void {
    this.revalidate$.next();
  }

}
