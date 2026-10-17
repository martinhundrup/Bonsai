const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function nodeAppearance(value) {
  return {
    size: clamp(value?.size, .55, 1.65, 1),
    rounding: clamp(value?.rounding, 0, 1, 0),
  };
}

export function appearanceSummary(nodes = []) {
  const values = nodes.map(node => nodeAppearance(node.appearance));
  const result = {};
  for (const property of ['size', 'rounding']) {
    const first = values[0]?.[property] ?? nodeAppearance()[property];
    result[property] = {
      value: values.length ? values.reduce((total, value) => total + value[property], 0) / values.length : first,
      mixed: values.some(value => value[property] !== first),
    };
  }
  return result;
}
