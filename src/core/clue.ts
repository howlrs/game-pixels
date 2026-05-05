// docs §30 ヒント: 行/列の連続塗り長さ列。
// MVP では実行時生成しない (パズル JSON に事前計算済を埋め込み、§80)。
// 本ファイルはパズル生成ツール側 (scripts/generate-puzzles.mjs) からも import される。

export type Clue = ReadonlyArray<number>;

export interface ClueSet {
  readonly width: number;
  readonly height: number;
  readonly rowClues: ReadonlyArray<Clue>;
  readonly colClues: ReadonlyArray<Clue>;
}

/** 1 行/列の連続塗り長さ列を生成。全空なら [0] を返す (§30.3 ゼロ行扱い)。 */
export function generateLineClue(line: ReadonlyArray<0 | 1>): Clue {
  const result: number[] = [];
  let runLength = 0;
  for (const cell of line) {
    if (cell === 1) {
      runLength++;
    } else if (runLength > 0) {
      result.push(runLength);
      runLength = 0;
    }
  }
  if (runLength > 0) result.push(runLength);
  return result.length === 0 ? [0] : result;
}

export function generateClueSet(solution: ReadonlyArray<ReadonlyArray<0 | 1>>): ClueSet {
  const height = solution.length;
  const width = solution[0]?.length ?? 0;
  const rowClues = solution.map(generateLineClue);
  const colClues: Clue[] = [];
  for (let col = 0; col < width; col++) {
    const colCells: (0 | 1)[] = [];
    for (let row = 0; row < height; row++) colCells.push(solution[row]![col]!);
    colClues.push(generateLineClue(colCells));
  }
  return { width, height, rowClues, colClues };
}
