// docs §14.1 game/: ゲームロジック (Zustand store)
export {
  useGame,
  VIEWPORT_DEFAULT,
  VIEWPORT_MAX_SCALE,
  VIEWPORT_MIN_SCALE,
  VIEWPORT_PAN_LIMIT,
} from './store.ts';
export type {
  AppPhase,
  ClueMarkState,
  CursorPos,
  DragSession,
  GameStore,
  InputMode,
  RestoreSnapshot,
  Viewport,
} from './store.ts';
