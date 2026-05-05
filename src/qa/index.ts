// Round 7-C QA 機構: 公開 API。
// 自動生成パイプライン (PR-D / PR-E) で使う「assessPuzzle(solution)」を提供。

import type { PuzzleData } from '@core/index.ts';
import { generateClueSet } from '@core/index.ts';
import { solveBoard, type SolveOptions, type SolveResult } from './board-solver.ts';
import {
  computeSymmetry,
  computeVisibility,
  type SymmetryMetrics,
  type VisibilityMetrics,
} from './metrics.ts';

export type { LineCellState } from './line-solver.ts';
export type { SolveResult, SolveStatus, SolveStats, SolveOptions } from './board-solver.ts';
export type { VisibilityMetrics, SymmetryMetrics, BoundingBox } from './metrics.ts';
export { solveLine, countLineSolutions } from './line-solver.ts';
export { solveBoard } from './board-solver.ts';
export { computeVisibility, computeSymmetry } from './metrics.ts';

export interface QaReport {
  /** ソルバーで判定した一意性 (timeout = 判定不能) */
  solver: SolveResult;
  /** 可視性メトリクス */
  visibility: VisibilityMetrics;
  /** 対称性メトリクス */
  symmetry: SymmetryMetrics;
  /** クリア合否ラベル: production puzzle として採用可能か */
  pass: boolean;
  /** pass=false の理由 (pass=true なら空配列) */
  reasons: string[];
}

export interface AssessOptions {
  solver?: SolveOptions;
  /** 採用基準 (デフォルト: production 用) */
  pass?: {
    /** 一意解必須 (デフォルト true) */
    requireUnique?: boolean;
    /** 論理ソルバーだけで解ける必要があるか (デフォルト true) */
    requireLogicallySolvable?: boolean;
    /** 最小塗りマス比率 (デフォルト 0.15) */
    minPixelRatio?: number;
    /** 最大塗りマス比率 (デフォルト 0.7) */
    maxPixelRatio?: number;
    /** 最大連結成分数 (デフォルト 4 — 多すぎると散らばった絵) */
    maxComponents?: number;
  };
}

/**
 * 入力: 2D solution (0/1)。ヒントは内部で再生成 (= ヒントの正しさも内側で担保)
 * 出力: QaReport
 */
export function assessSolution(
  solution: ReadonlyArray<ReadonlyArray<0 | 1>>,
  opts: AssessOptions = {},
): QaReport {
  const passOpts = {
    requireUnique: opts.pass?.requireUnique ?? true,
    requireLogicallySolvable: opts.pass?.requireLogicallySolvable ?? true,
    minPixelRatio: opts.pass?.minPixelRatio ?? 0.15,
    maxPixelRatio: opts.pass?.maxPixelRatio ?? 0.7,
    maxComponents: opts.pass?.maxComponents ?? 4,
  };

  const visibility = computeVisibility(solution);
  const symmetry = computeSymmetry(solution);
  const cs = generateClueSet(solution);
  const solver = solveBoard(cs.rowClues, cs.colClues, opts.solver);

  const reasons: string[] = [];
  if (passOpts.requireUnique) {
    if (solver.status !== 'unique') {
      reasons.push(`solver.status='${solver.status}' (一意解必須)`);
    }
  }
  if (passOpts.requireLogicallySolvable && !solver.logicallySolvable) {
    reasons.push('論理ソルバーで完全に解けない (推測必要)');
  }
  if (visibility.pixelRatio < passOpts.minPixelRatio) {
    reasons.push(
      `pixelRatio=${visibility.pixelRatio.toFixed(2)} < ${passOpts.minPixelRatio} (薄すぎる絵)`,
    );
  }
  if (visibility.pixelRatio > passOpts.maxPixelRatio) {
    reasons.push(
      `pixelRatio=${visibility.pixelRatio.toFixed(2)} > ${passOpts.maxPixelRatio} (塗りすぎ)`,
    );
  }
  if (visibility.components > passOpts.maxComponents) {
    reasons.push(`components=${visibility.components} > ${passOpts.maxComponents} (散らばりすぎ)`);
  }

  return {
    solver,
    visibility,
    symmetry,
    pass: reasons.length === 0,
    reasons,
  };
}

export function assessPuzzle(puzzle: PuzzleData, opts: AssessOptions = {}): QaReport {
  return assessSolution(puzzle.solution, opts);
}
