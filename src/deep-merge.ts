type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const deepMerge = (base: PlainObject, override: PlainObject): PlainObject => {
  const result: PlainObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
};
