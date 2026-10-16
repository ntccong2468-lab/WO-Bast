export const variables = [
  'product_name',
  'marketplace',
  'category',
  'aspect_ratio',
  'language',
  'verified_attributes',
] as const;
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
