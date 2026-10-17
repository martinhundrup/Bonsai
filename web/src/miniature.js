import { branchLayout, branchWeights, nodeMetrics } from './graph.js';
import { getSpecies } from './species.js';

// Sample breadth-first, keeping ancestors and every part of a wide canopy
// represented. Do not discard tall trees at an arbitrary depth.
export function miniatureLayout(doc) {
  if (doc.empty || !doc.nodes.length) return null;
  const nodes = [];
  let frontier = [doc.nodes[0].id];
  while (frontier.length && nodes.length < 280) {
    const candidates = frontier.filter(id => !doc.excluded.has(id));
    const count = Math.min(candidates.length, 280 - nodes.length);
    frontier = [];
    for (let index = 0; index < count; index++) {
      // Spread a limited sample across the entire level, including both ends,
      // rather than showing only the leftmost branches of a large document.
      const offset = count === candidates.length ? index : Math.round(index * (candidates.length - 1) / Math.max(1, count - 1));
      const node = doc.byId.get(candidates[offset]);
      nodes.push(node); frontier.push(...node.children);
    }
  }
  if (!nodes.length) return null;
  const style = getSpecies(doc.species);
  const fallback = branchLayout(nodes, new Map(), new Map(doc.arrangement?.preferences), [], style);
  const raw = new Map();
  for (const node of nodes) {
    const saved = doc.arrangement?.positions.get(node.id);
    const parent = raw.get(node.parent), origin = fallback.get(node.id), parentOrigin = fallback.get(node.parent);
    raw.set(node.id, saved ?? (parent && parentOrigin ? { x: parent.x + origin.x - parentOrigin.x, y: parent.y + origin.y - parentOrigin.y } : origin));
  }
  const potX = doc.arrangement?.pot?.x ?? raw.get(nodes[0].id).x;
  let minX = potX, maxX = potX, minY = Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const p = raw.get(node.id);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y + nodeMetrics(node.depth).height / 2);
    maxY = Math.max(maxY, p.y + nodeMetrics(node.depth).height / 2);
  }
  // Fit the axes separately: wide trees retain their relative positions and
  // still occupy the available height instead of becoming a tiny flat stripe.
  const x = value => maxX === minX ? 80 : 34 + (value - minX) / (maxX - minX) * 92;
  const y = value => maxY === minY ? 68 : 12 + (value - minY) / (maxY - minY) * 74;
  const positions = new Map(nodes.map(node => [node.id, { x: x(raw.get(node.id).x), y: y(raw.get(node.id).y + nodeMetrics(node.depth).height / 2) }]));
  const radius = Math.max(4.5, Math.min(10, 38 / Math.sqrt(nodes.length)));
  // Keep the complete wood silhouette, but thin out overlapping foliage pads.
  // Otherwise hundreds of leaves turn into solid bars at thumbnail size.
  const foliage = [], gap = nodes.length > 12 ? 9 : 0;
  for (const node of [...nodes].reverse()) {
    const p = positions.get(node.id);
    if (foliage.some(other => { const q = positions.get(other.id); return Math.hypot(p.x - q.x, p.y - q.y) < gap; })) continue;
    foliage.push(node);
  }
  return { nodes, foliage, positions, raw, rawPot: doc.arrangement?.pot ?? { x: potX, y: raw.get(nodes[0].id).y + 116 }, potX: x(potX), radius, weights: branchWeights(nodes) };
}
