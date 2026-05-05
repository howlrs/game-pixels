import { describe, expect, test } from 'bun:test';
import { formatTime } from './format.ts';

describe('formatTime (β7.0-α)', () => {
  test('0 ms → "00:00"', () => {
    expect(formatTime(0)).toBe('00:00');
  });
  test('1 秒未満は切り捨て', () => {
    expect(formatTime(999)).toBe('00:00');
  });
  test('1 秒 = "00:01"', () => {
    expect(formatTime(1000)).toBe('00:01');
  });
  test('59 秒 = "00:59"', () => {
    expect(formatTime(59_999)).toBe('00:59');
  });
  test('60 秒 = "01:00"', () => {
    expect(formatTime(60_000)).toBe('01:00');
  });
  test('65 秒 = "01:05"', () => {
    expect(formatTime(65_000)).toBe('01:05');
  });
  test('60 分 = "60:00" (2 桁を超えても表示)', () => {
    expect(formatTime(3_600_000)).toBe('60:00');
  });
  test('100 分 = "100:00"', () => {
    expect(formatTime(100 * 60_000)).toBe('100:00');
  });
  test('負値は 0 扱い', () => {
    expect(formatTime(-1000)).toBe('00:00');
  });
  test('NaN は 0 扱い', () => {
    expect(formatTime(Number.NaN)).toBe('00:00');
  });
  test('Infinity は 0 扱い', () => {
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});
