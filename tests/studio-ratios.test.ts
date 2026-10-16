import { expect, test } from 'vitest';
import { aspectRatios } from '../src/shared/studio-contracts';
import {
  normalizeProductSize,
  resolveAspectRatio,
  outputDimensions,
} from '../src/shared/studio-ratios';

test('offers every requested ratio including 9:16 and original', () => {
  expect(aspectRatios.map((ratio) => ratio.id)).toEqual([
    '1:1',
    '2:3',
    '3:4',
    '4:5',
    '9:16',
    '3:2',
    '4:3',
    '16:9',
    '5:4',
    '21:9',
    'original',
  ]);
});

test('keeps seller size text while validating multiple supported formats', () => {
  expect(normalizeProductSize('48-56; 58-66; M; One Size')).toBe('48-56; 58-66; M; One Size');
  expect(() => normalizeProductSize('48-56;')).toThrow('size');
  expect(() => normalizeProductSize('x'.repeat(201))).toThrow('size');
});

test('resolves original ratio from source dimensions and pads without stretching', () => {
  expect(resolveAspectRatio('original', 1080, 1920)).toBe('9:16');
  expect(outputDimensions('9:16')).toEqual({ width: 864, height: 1536 });
  expect(outputDimensions('2:3')).toEqual({ width: 1024, height: 1536 });
});
