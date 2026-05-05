// docs §14.1 core/: 盤面モデル / ヒント / パズル / セーブ (DOM 非依存)

export {
  EMPTY,
  FILLED,
  X_MARKED,
  applyAt,
  computeProgress,
  createBoard,
  getCell,
  indexOf,
  isCleared,
  resetBoard,
  setCell,
} from './board.ts';
export type { Board, CellState, ProgressStats } from './board.ts';

export { generateClueSet, generateLineClue } from './clue.ts';
export type { Clue, ClueSet } from './clue.ts';

export {
  PuzzleDataSchema,
  PuzzleIndexSchema,
  PuzzleLoadError,
  flattenSolution,
  loadPuzzle,
  loadPuzzleIndex,
  validatePuzzleConsistency,
} from './puzzle.ts';
export type { DifficultyLevel, PuzzleCategory, PuzzleData, PuzzleIndex, PuzzleMeta } from './puzzle.ts';

export {
  CURRENT_SCHEMA_VERSION,
  InMemoryBackend,
  LocalStorageBackend,
  SaveDataSchema,
  debounce,
  defaultSaveData,
  loadAndMigrate,
} from './save.ts';
export type { ActivePuzzleSave, PuzzleClearRecord, SaveBackend, SaveData, UserSettings } from './save.ts';

export { formatTime } from './format.ts';
