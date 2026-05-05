import { describe, expect, test } from 'bun:test';
import { deriveButtonState } from './snapshot.ts';

describe('deriveButtonState', () => {
  test('up + 押下 → pressed', () => {
    expect(deriveButtonState('up', true)).toBe('pressed');
  });
  test('pressed + 押下継続 → held', () => {
    expect(deriveButtonState('pressed', true)).toBe('held');
  });
  test('held + 押下継続 → held', () => {
    expect(deriveButtonState('held', true)).toBe('held');
  });
  test('held + 離す → released', () => {
    expect(deriveButtonState('held', false)).toBe('released');
  });
  test('released + 押さない → up', () => {
    expect(deriveButtonState('released', false)).toBe('up');
  });
  test('released + 押下 → pressed', () => {
    expect(deriveButtonState('released', true)).toBe('pressed');
  });
  test('pressed + 離す → released (タップ)', () => {
    expect(deriveButtonState('pressed', false)).toBe('released');
  });
});
