import { test, expect } from 'vitest';
import { interpolate } from '../src/shared/interpolation';
test('all six supported values interpolate once as plain text', () => {
  const values = {
    product_name: '<b>{{language}}</b>',
    marketplace: 'Ozon',
    category: 'Áo',
    aspect_ratio: '3:4',
    language: 'ru',
    verified_attributes: 'хлопок',
  };
  const r = interpolate(
    Object.keys(values)
      .map((k) => '{{' + k + '}}')
      .join('|'),
    values,
  );
  expect(r.text).toBe(Object.values(values).join('|'));
  expect(r.missing).toEqual([]);
  expect(r.unsupported).toEqual([]);
});
test('missing, blank and unsupported variables are unique and visible', () => {
  const r = interpolate('{{product_name}} {{product_name}} {{language}} {{evil}}', {
    language: ' ',
  });
  expect(r.missing).toEqual(['product_name', 'language']);
  expect(r.unsupported).toEqual(['evil']);
  expect(r.text).toContain('{{evil}}');
});
