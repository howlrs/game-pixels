// Round 7-C QA 機構: 1 行 (または 1 列) の line solver。
//
// 目的: ヒント (例: [3, 1]) と現在の line 状態 (FILLED/EMPTY/UNKNOWN) から、
//       「この line で必ず塗る/塗らないセル」を推論する。
//
// アルゴリズム: 全配置パターンをバックトラッキングで列挙し、各セルが
// 「全パターンで FILLED」→ 確定 FILLED
// 「全パターンで EMPTY」→ 確定 EMPTY
// 「両方ある」→ UNKNOWN
// と判定する。
//
// 計算量: 純粋な再帰バックトラッキング (15x15 サイズ特化)。
// 15x15, ブロック数 k ≤ 8 程度なら配置数は数百〜数千に収まり実用上 μs オーダー。
// 20x20 以上に拡張する場合はメモ化を検討すること (Round 7-C / Gemini Pro レビュー指摘 2)。
//
// 公開:
// - solveLine(clue, line): 推論後の line を返す (進展のみ)
// - countLineSolutions(clue, line, limit?): 該当 line の有効配置数 (上限 limit 到達で打ち切り)

export type LineCellState = 0 | 1 | -1;
// 0 = EMPTY 確定 / 1 = FILLED 確定 / -1 = UNKNOWN

const EMPTY_C: LineCellState = 0;
const FILLED_C: LineCellState = 1;
const UNKNOWN_C: LineCellState = -1;

/**
 * line: 現在分かっている状態の配列 (UNKNOWN を含む)。
 * clue: ヒント (ブロック長の配列、空配列 = 全マス EMPTY を意味する [Picross 慣習])。
 * 返り値: 推論後の line (元と同じ長さ)。矛盾時は null を返す。
 */
export function solveLine(
  clue: ReadonlyArray<number>,
  line: ReadonlyArray<LineCellState>,
): LineCellState[] | null {
  const n = line.length;
  if (n === 0) return [];

  // 空 clue (= 全マス EMPTY) の特殊処理
  // §30.3 ゼロ行扱い: 慣習として `[0]` も全マス EMPTY を意味するので同様に処理
  if (clue.length === 0 || (clue.length === 1 && clue[0] === 0)) {
    if (line.some((c) => c === FILLED_C)) return null;
    return new Array(n).fill(EMPTY_C);
  }

  // 各セルが「全パターンで FILLED か」「全パターンで EMPTY か」を集計
  const filledMask = new Uint8Array(n); // bit0 = FILLED が出たか
  const emptyMask = new Uint8Array(n); // bit0 = EMPTY が出たか
  let solutionCount = 0;

  // バックトラッキングで全配置を列挙
  // 配置 = clue[i] のブロックを line のどこに置くか (左端の index)
  // ブロック i の最小左端 = previous_block_end + 1
  // ブロック i の最大左端 = n - (sum of clue[i..]) - (clue.length - i - 1)

  const k = clue.length;
  const positions = new Array<number>(k);
  const minStart = new Array<number>(k);
  const maxStart = new Array<number>(k);

  // ブロック i 以降のサイズ合計 (gap 含む = sum + (k-i-1))
  // 例: clue = [3, 1], i=0 なら 3 + 1 + 1 = 5 (gap 1)
  const sumAfter = new Array<number>(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    sumAfter[i] = clue[i]! + (i < k - 1 ? 1 : 0) + sumAfter[i + 1]!;
  }

  for (let i = 0; i < k; i++) {
    const blockSizes = sumAfter[i]! - (i < k ? 0 : 0);
    minStart[i] = i === 0 ? 0 : 0; // 個別計算は再帰中に
    maxStart[i] = n - blockSizes;
  }

  // 再帰末端で使う pattern バッファを事前確保 (Gemini レビュー指摘 2-2: GC 負荷軽減)
  const pattern = new Uint8Array(n);

  // 配置の現在版 line を保持して各セル mask に反映する
  function place(blockIdx: number, fromCol: number): boolean {
    if (blockIdx === k) {
      // 残り全 EMPTY
      for (let c = fromCol; c < n; c++) {
        if (line[c] === FILLED_C) return false;
      }
      // 1 つの完成パターンが見つかった
      // current placement: positions[0..k-1] が各ブロックの左端
      // pattern バッファを再利用 (fill(0) → 各ブロック塗り)
      pattern.fill(0);
      for (let i = 0; i < k; i++) {
        const start = positions[i]!;
        for (let j = 0; j < clue[i]!; j++) pattern[start + j] = 1;
      }
      // line と矛盾チェックは place 中に既に済んでいる前提だが、
      // 念のため fromCol 前のセルは check 済として進む
      for (let c = 0; c < n; c++) {
        if (pattern[c] === 1) filledMask[c]! |= 1;
        else emptyMask[c]! |= 1;
      }
      solutionCount++;
      return true;
    }

    const blockLen = clue[blockIdx]!;
    // ブロック blockIdx の左端 start を fromCol..maxStart[blockIdx] で試す
    const maxStartHere = n - sumAfter[blockIdx]!;
    for (let start = fromCol; start <= maxStartHere; start++) {
      // start..start+blockLen-1 を FILLED として置けるか
      // - line にこの範囲で EMPTY 確定があれば不可
      // - start の直前 (= start-1) を EMPTY として埋めるが、line がそこで FILLED 確定なら不可
      // - start+blockLen 直後 (gap) も EMPTY として埋まる必要がある (次ブロックがある場合)

      // チェック 1: fromCol..start-1 に FILLED 確定があれば、それを skip した時点で配置不能
      let preOk = true;
      for (let c = fromCol; c < start; c++) {
        if (line[c] === FILLED_C) {
          preOk = false;
          break;
        }
      }
      if (!preOk) break; // start 以降に進めても fromCol..start-1 区間は同じく不可なので即終了

      // チェック 2: ブロック範囲に EMPTY 確定があれば不可
      let blockOk = true;
      for (let c = start; c < start + blockLen; c++) {
        if (line[c] === EMPTY_C) {
          blockOk = false;
          break;
        }
      }
      if (!blockOk) continue;

      // チェック 3: 次ブロックがあれば、blockEnd 直後 1 マスは EMPTY (FILLED 確定不可)
      const blockEnd = start + blockLen;
      if (blockIdx < k - 1) {
        if (blockEnd < n && line[blockEnd] === FILLED_C) continue;
      }

      // 配置採用
      positions[blockIdx] = start;
      const nextFrom = blockIdx < k - 1 ? blockEnd + 1 : blockEnd;
      place(blockIdx + 1, nextFrom);
    }
    return true;
  }

  place(0, 0);

  if (solutionCount === 0) return null; // ヒントと矛盾

  // mask から推論結果を構築
  const result: LineCellState[] = new Array(n);
  for (let c = 0; c < n; c++) {
    const mustFilled = (emptyMask[c]! & 1) === 0; // EMPTY 一度も無し
    const mustEmpty = (filledMask[c]! & 1) === 0; // FILLED 一度も無し
    if (mustFilled) result[c] = FILLED_C;
    else if (mustEmpty) result[c] = EMPTY_C;
    else result[c] = UNKNOWN_C;
  }

  // 既存 line との矛盾チェック (確定値が反転していないか)
  for (let c = 0; c < n; c++) {
    const cur = line[c]!;
    const next = result[c]!;
    if (cur === FILLED_C && next === EMPTY_C) return null;
    if (cur === EMPTY_C && next === FILLED_C) return null;
    // 既知の確定は維持 (推論は同じか UNKNOWN になるはずだが、保険)
    if (cur !== UNKNOWN_C) result[c] = cur;
  }

  return result;
}

/**
 * countLineSolutions: ヒント + 現在 line に合致する有効配置数を数える。
 * limit に到達したら打ち切り (大きい line でも O(limit) で済む)。
 * 一意性早期検出 (2 以上を確認したら即停止) に使う。
 */
export function countLineSolutions(
  clue: ReadonlyArray<number>,
  line: ReadonlyArray<LineCellState>,
  limit = 2,
): number {
  const n = line.length;
  if (n === 0) return clue.length === 0 ? 1 : 0;
  if (clue.length === 0 || (clue.length === 1 && clue[0] === 0)) {
    return line.every((c) => c !== FILLED_C) ? 1 : 0;
  }

  const k = clue.length;
  const positions = new Array<number>(k);
  const sumAfter = new Array<number>(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    sumAfter[i] = clue[i]! + (i < k - 1 ? 1 : 0) + sumAfter[i + 1]!;
  }

  let count = 0;
  function place(blockIdx: number, fromCol: number): boolean {
    if (count >= limit) return false;
    if (blockIdx === k) {
      for (let c = fromCol; c < n; c++) {
        if (line[c] === FILLED_C) return false;
      }
      count++;
      return true;
    }
    const blockLen = clue[blockIdx]!;
    const maxStartHere = n - sumAfter[blockIdx]!;
    for (let start = fromCol; start <= maxStartHere; start++) {
      let preOk = true;
      for (let c = fromCol; c < start; c++) {
        if (line[c] === FILLED_C) {
          preOk = false;
          break;
        }
      }
      if (!preOk) break;
      let blockOk = true;
      for (let c = start; c < start + blockLen; c++) {
        if (line[c] === EMPTY_C) {
          blockOk = false;
          break;
        }
      }
      if (!blockOk) continue;
      const blockEnd = start + blockLen;
      if (blockIdx < k - 1 && blockEnd < n && line[blockEnd] === FILLED_C) continue;
      positions[blockIdx] = start;
      const nextFrom = blockIdx < k - 1 ? blockEnd + 1 : blockEnd;
      place(blockIdx + 1, nextFrom);
      if (count >= limit) return false;
    }
    return true;
  }
  place(0, 0);
  return count;
}
