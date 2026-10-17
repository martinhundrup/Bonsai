import { nodeMetrics } from './graph.js';

// Compare the final on-screen size, including depth taper and custom sizing.
// Full controls need roughly 10px text. Keep a readable key at medium sizes;
// distant cards show only their shape.
export function nodeDetailLevel(node, zoom) {
  const scale = nodeMetrics(node).scale * zoom;
  return scale >= .7 ? 'full' : scale >= .32 ? 'compact' : 'simple';
}
