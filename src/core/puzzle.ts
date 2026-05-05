// docs §80 パズルデータ: Valibot Schema-first バリデーション。
// 責務分担 (§8.7): 生成ツール側で論理的整合性 100% 保証、ゲーム側は型 + 範囲のみ検証。

import * as v from 'valibot';

export type PuzzleCategory = '5x5' | '10x10' | '15x15' | '25x25';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

const ClueSchema = v.array(v.pipe(v.number(), v.integer(), v.minValue(0)));

const PuzzleMetaSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/)),
  title: v.pipe(v.string(), v.minLength(1)),
  width: v.pipe(v.number(), v.integer(), v.minValue(3), v.maxValue(50)),
  height: v.pipe(v.number(), v.integer(), v.minValue(3), v.maxValue(50)),
  difficulty: v.picklist(['easy', 'medium', 'hard']),
  estimatedSolveSeconds: v.pipe(v.number(), v.integer(), v.minValue(10)),
  category: v.picklist(['5x5', '10x10', '15x15', '25x25']),
  description: v.string(),
});

export const PuzzleDataSchema = v.object({
  meta: PuzzleMetaSchema,
  /** 1=塗 / 0=空 の 2D 配列。 length === height、各行の length === width */
  solution: v.array(v.array(v.picklist([0, 1]))),
  rowClues: v.array(ClueSchema),
  colClues: v.array(ClueSchema),
  isUniqueSolution: v.boolean(),
});

export type PuzzleData = v.InferOutput<typeof PuzzleDataSchema>;
export type PuzzleMeta = v.InferOutput<typeof PuzzleMetaSchema>;

export interface PuzzleIndex {
  puzzles: ReadonlyArray<PuzzleMeta>;
  categoryOrder: ReadonlyArray<PuzzleCategory>;
}

export const PuzzleIndexSchema = v.object({
  puzzles: v.array(PuzzleMetaSchema),
  categoryOrder: v.array(v.picklist(['5x5', '10x10', '15x15', '25x25'])),
});

export class PuzzleLoadError extends Error {
  constructor(
    public readonly kind: 'FETCH_FAILED' | 'SCHEMA_INVALID' | 'CROSS_FIELD',
    public readonly url: string,
    public readonly issues?: unknown,
    message?: string,
  ) {
    super(message ?? `${kind} for ${url}`);
    this.name = 'PuzzleLoadError';
  }
}

/** Cross-field 検証 (§80.6): solution の長さと meta の整合 */
export function validatePuzzleConsistency(puzzle: PuzzleData, url: string): void {
  if (puzzle.solution.length !== puzzle.meta.height) {
    throw new PuzzleLoadError(
      'CROSS_FIELD',
      url,
      { expected: puzzle.meta.height, actual: puzzle.solution.length },
      `solution row count mismatch`,
    );
  }
  for (let i = 0; i < puzzle.solution.length; i++) {
    if (puzzle.solution[i]!.length !== puzzle.meta.width) {
      throw new PuzzleLoadError(
        'CROSS_FIELD',
        url,
        { row: i, expected: puzzle.meta.width, actual: puzzle.solution[i]!.length },
      );
    }
  }
  if (puzzle.rowClues.length !== puzzle.meta.height) {
    throw new PuzzleLoadError('CROSS_FIELD', url, { field: 'rowClues' });
  }
  if (puzzle.colClues.length !== puzzle.meta.width) {
    throw new PuzzleLoadError('CROSS_FIELD', url, { field: 'colClues' });
  }
}

export async function loadPuzzle(url: string, fetcher: typeof fetch = fetch): Promise<PuzzleData> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (cause) {
    throw new PuzzleLoadError('FETCH_FAILED', url, cause);
  }
  if (!res.ok) throw new PuzzleLoadError('FETCH_FAILED', url, { status: res.status });
  const raw: unknown = await res.json();
  const parsed = v.safeParse(PuzzleDataSchema, raw);
  if (!parsed.success) {
    throw new PuzzleLoadError('SCHEMA_INVALID', url, parsed.issues);
  }
  validatePuzzleConsistency(parsed.output, url);
  return parsed.output;
}

export async function loadPuzzleIndex(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<PuzzleIndex> {
  const res = await fetcher(url);
  if (!res.ok) throw new PuzzleLoadError('FETCH_FAILED', url, { status: res.status });
  const raw: unknown = await res.json();
  const parsed = v.safeParse(PuzzleIndexSchema, raw);
  if (!parsed.success) {
    throw new PuzzleLoadError('SCHEMA_INVALID', url, parsed.issues);
  }
  return parsed.output;
}

/** 1D 化 (Board と同じレイアウト): 2D solution → 1D の (0|1)[] */
export function flattenSolution(puzzle: PuzzleData): ReadonlyArray<0 | 1> {
  const out: (0 | 1)[] = [];
  for (const row of puzzle.solution) {
    for (const cell of row) out.push(cell);
  }
  return out;
}
