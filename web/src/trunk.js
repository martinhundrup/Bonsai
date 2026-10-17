import { nodeMetrics } from './graph.js';
import { getSpecies } from './species.js';

const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizeTrunkSettings(settings = {}) {
  settings = settings && typeof settings === 'object' ? settings : {};
  const next = {};
  if (Number.isFinite(settings.baseThickness)) next.baseThickness = clamp(settings.baseThickness, .25, 2, 1);
  if (Number.isFinite(settings.taperAmount)) next.taperAmount = clamp(settings.taperAmount, 0, 100, 90);
  return next;
}

export function trunkSettings(doc) {
  const settings = normalizeTrunkSettings(doc?.trunkSettings);
  return { baseThickness: settings.baseThickness ?? 1, taperAmount: settings.taperAmount ?? getSpecies(doc?.species).trunk.taperAmount };
}

// Stations measure distance from the soil along the whole branching tree,
// including the hidden distance through each card. A new edge never resets
// thickness. Hanging branches continue tapering rather than getting fat again.
export function trunkProfile(nodes, positions, pot, style, settings, preferences = new Map()) {
  const points = new Map(), stations = new Map(), masses = new Map(), flows = new Map();
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    masses.set(node.id, Math.max(1, node.children.reduce((sum, id) => sum + (masses.get(id) ?? 0), 0)));
  }
  let totalLength = 1, top = pot.y + 11;
  for (const node of nodes) {
    const parent = points.get(node.parent), parentStation = stations.get(node.parent);
    const saved = positions.get(node.id), offset = preferences.get(node.id) ?? { x: 0, y: -200 };
    const p = saved ?? (parent ? { x: parent.x + offset.x, y: parent.y + offset.y } : { x: pot.x, y: pot.y - 116 });
    points.set(node.id, p);
    const flow = node.parent === null ? 1 : (flows.get(node.parent) ?? 1) * Math.sqrt(masses.get(node.id) / Math.max(1, masses.get(node.parent) ?? 1));
    flows.set(node.id, flow);
    const height = nodeMetrics(node.depth).height;
    const from = parent ?? { x: pot.x, y: pot.y + 11 };
    const incoming = (parentStation?.outgoing ?? 0) + Math.hypot(p.x - from.x, p.y + height - from.y);
    const outgoing = incoming + height;
    stations.set(node.id, { incoming, outgoing });
    totalLength = Math.max(totalLength, outgoing); top = Math.min(top, p.y);
  }
  const totalHeight = Math.max(80, pot.y + 11 - top);
  const baseRadius = Math.min(96, (8 + Math.sqrt(totalHeight) * .28) * style.thickness * settings.baseThickness);
  const amount = settings.taperAmount / 100;
  const radius = (station, flow) => Math.max(.8, baseRadius * flow * Math.pow(Math.max(0, 1 - amount * station / totalLength), style.taperPower ?? 1.2));
  return {
    baseRadius, totalHeight, totalLength, stations,
    edge(node) {
      const parent = stations.get(node.parent), child = stations.get(node.id);
      const flow = flows.get(node.id) ?? 1;
      return { baseRadius: radius(parent?.outgoing ?? 0, flow), tipRadius: radius(child?.incoming ?? totalLength, flow) };
    },
  };
}
