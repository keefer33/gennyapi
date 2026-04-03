// Remove empty values (null, undefined, empty strings, empty arrays, empty objects) from payload
export const removeEmptyValues = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    const filtered = obj.map(removeEmptyValues).filter(item => {
      if (item === null || item === undefined) return false;
      if (typeof item === 'string' && item === '') return false;
      if (Array.isArray(item) && item.length === 0) return false;
      if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
      return true;
    });
    return filtered.length === 0 ? undefined : filtered;
  }

  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanedValue = removeEmptyValues(value);

    // Skip if value is empty
    if (cleanedValue === null || cleanedValue === undefined) continue;
    if (typeof cleanedValue === 'string' && cleanedValue === '') continue;
    if (Array.isArray(cleanedValue) && cleanedValue.length === 0) continue;
    if (typeof cleanedValue === 'object' && !Array.isArray(cleanedValue) && Object.keys(cleanedValue).length === 0)
      continue;

    cleaned[key] = cleanedValue;
  }

  return Object.keys(cleaned).length === 0 ? undefined : cleaned;
};

