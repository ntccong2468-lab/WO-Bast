export const variables = [
  'product_name',
  'marketplace',
  'category',
  'aspect_ratio',
  'language',
  'verified_attributes',
  'product_size',
] as const;
export const variableLabels: Record<string, string> = {
  product_name: 'Tên sản phẩm',
  marketplace: 'Sàn thương mại điện tử',
  category: 'Danh mục',
  aspect_ratio: 'Tỷ lệ ảnh',
  language: 'Ngôn ngữ',
  verified_attributes: 'Đặc tính đã quan sát',
  product_size: 'Kích thước sản phẩm (Size)',
};
export const sellerEditableVariables = ['product_size'] as const;
export function interpolate(body: string, values: Record<string, string>) {
  const missing = new Set<string>(),
    unsupported = new Set<string>();
  const text = body.replace(/{{\s*([^{}]+?)\s*}}/g, (match, key: string) => {
    if (!(variables as readonly string[]).includes(key)) {
      unsupported.add(key);
      return match;
    }
    if (!values[key]?.trim()) {
      missing.add(key);
      return match;
    }
    return values[key];
  });
  return { text, missing: [...missing], unsupported: [...unsupported] };
}
