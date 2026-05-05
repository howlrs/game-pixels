// docs §94.3 / §17.14 H: 固定タイムステップが 120Hz 環境でも物理を 60Hz 維持できることを検証。

import { describe, expect, test } from 'bun:test';
import { PHYSICS_DT_MS, createFixedStepLoop } from './loop.ts';

describe('createFixedStepLoop', () => {
  test('60Hz frame で 1 step 消化', () => {
    let physicsCalls = 0;
    let renderCalls = 0;
    const loop = createFixedStepLoop({
      physicsStep: () => {
        physicsCalls += 1;
      },
      render: () => {
        renderCalls += 1;
      },
    });
    loop.onFrame(PHYSICS_DT_MS);
    expect(physicsCalls).toBe(1);
    expect(renderCalls).toBe(1);
    expect(loop.state().lastSteps).toBe(1);
  });

  test('120Hz frame (=8.33ms) で 0 step 消化、2 frame で 1 step 消化', () => {
    let physicsCalls = 0;
    const loop = createFixedStepLoop({
      physicsStep: () => {
        physicsCalls += 1;
      },
      render: () => {},
    });
    loop.onFrame(PHYSICS_DT_MS / 2);
    expect(physicsCalls).toBe(0);
    loop.onFrame(PHYSICS_DT_MS / 2);
    expect(physicsCalls).toBe(1);
  });

  test('250ms 超は MAX_FRAME_MS にクリップ (spiral of death 防止)', () => {
    let physicsCalls = 0;
    const loop = createFixedStepLoop({
      physicsStep: () => {
        physicsCalls += 1;
      },
      render: () => {},
    });
    // 1000ms 渡しても 250ms (=15 step) までしか進まないが、デフォルト maxSteps=5
    loop.onFrame(1000);
    expect(physicsCalls).toBe(5);
  });

  test('maxStepsPerFrame で消化数を制御できる', () => {
    let physicsCalls = 0;
    const loop = createFixedStepLoop({
      physicsStep: () => {
        physicsCalls += 1;
      },
      render: () => {},
      maxStepsPerFrame: 2,
    });
    loop.onFrame(1000);
    expect(physicsCalls).toBe(2);
  });

  test('maxSteps 使い切り時に残り accumulator を捨てる', () => {
    const loop = createFixedStepLoop({
      physicsStep: () => {},
      render: () => {},
      maxStepsPerFrame: 2,
    });
    loop.onFrame(1000);
    expect(loop.state().accumulatorMs).toBe(0);
  });

  test('alpha は次フレームの補間係数 [0, 1)', () => {
    let lastAlpha = -1;
    const loop = createFixedStepLoop({
      physicsStep: () => {},
      render: (a) => {
        lastAlpha = a;
      },
    });
    loop.onFrame(PHYSICS_DT_MS * 1.5); // 1 step 消化、accumulator = 0.5 * dt
    expect(lastAlpha).toBeCloseTo(0.5, 2);
  });

  test('reset で accumulator が 0 に戻る', () => {
    const loop = createFixedStepLoop({
      physicsStep: () => {},
      render: () => {},
    });
    loop.onFrame(PHYSICS_DT_MS / 2);
    expect(loop.state().accumulatorMs).toBeGreaterThan(0);
    loop.reset();
    expect(loop.state().accumulatorMs).toBe(0);
  });
});
