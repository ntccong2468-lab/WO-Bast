import type { AspectRatioId } from './studio-contracts';

const dimensions: Record<Exclude<AspectRatioId, 'original'>, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '2:3': { width: 1024, height: 1536 },
  '3:4': { width: 1152, height: 1536 },
  '4:5': { width: 1229, height: 1536 },
  '9:16': { width: 864, height: 1536 },
  '3:2': { width: 1536, height: 1024 },
  '4:3': { width: 1536, height: 1152 },
  '16:9': { width: 1536, height: 864 },
  '5:4': { width: 1536, height: 1229 },
  '21:9': { width: 1536, height: 659 },
};

function ratioValue(ratio: Exclude<AspectRatioId, 'original'>) {
  const [width, height] = ratio.split(':').map(Number);
  return width / height;
}

export function normalizeProductSize(value: string) {
  if (typeof value !== 'string' || value.length > 200) throw new Error('invalid_size');
  const segments = value.split(';').map((segment) => segment.trim());
  if (
    !value.trim() ||
    segments.some((segment) => !segment || !/^[\p{L}\p{N}][\p{L}\p{N}\s./+–-]*$/u.test(segment))
  )
    throw new Error('invalid_size');
  return value;
}

export function resolveAspectRatio(
  requested: AspectRatioId,
  width: number,
  height: number,
): Exclude<AspectRatioId, 'original'> {
  if (requested !== 'original') return requested;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Tỷ lệ ảnh không hợp lệ');
  return (Object.keys(dimensions) as Exclude<AspectRatioId, 'original'>[]).reduce(
    (best, candidate) =>
      Math.abs(ratioValue(candidate) - width / height) < Math.abs(ratioValue(best) - width / height)
        ? candidate
        : best,
  );
}

export function outputDimensions(ratio: Exclude<AspectRatioId, 'original'>) {
  return dimensions[ratio];
}
