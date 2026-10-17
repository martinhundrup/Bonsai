// Use JSON paths rather than random node IDs: a tree keeps its character after
// import, edits, folding, and reloads without generating new random positions.
function variation(node) {
  let hash = 2166136261;
  for (const char of JSON.stringify(node.path ?? [node.key])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function elm({ index, leader, depth, noise, direction }) {
  // A sinuous leader grows upward; side shoots alternate in irregular clusters.
  if (index === leader) return { x: Math.sin(depth * 1.4 + noise * 2) * 100, y: -245 - noise * 65 };
  const rank = index < leader ? index : index - 1;
  const side = (rank + depth) % 2 ? 1 : -1;
  return { x: side * (245 + Math.floor(rank / 2) * 135) + direction * 35, y: -145 - (rank % 3) * 78 - noise * 35 };
}

function maple({ index, count, depth, noise, direction, mass }) {
  // Successive elliptical fans open toward the tip of the parent branch.
  const slot = count === 1 ? Math.sin(depth * 1.2) * .18 : index / (count - 1) * 2 - 1;
  const angle = slot * 1.12 + direction * .26;
  const radius = 255 + Math.log2(mass + 1) * 28;
  return { x: Math.sin(angle) * radius, y: -135 - Math.cos(angle) * 155 - noise * 35 };
}

function pine({ index, leader, depth, noise, direction }) {
  // One strong apex, with lateral pads alternating in height and reach.
  if (index === leader) return { x: Math.sin(depth * 1.7) * 24, y: -345 - noise * 50 };
  const rank = index < leader ? index : index - 1;
  const side = rank % 2 ? 1 : -1;
  return { x: side * (290 + Math.floor(rank / 2) * 145) / (1 + Math.min(depth, 6) * .09) + direction * 45, y: -145 - rank * 92 - noise * 22 };
}

function juniper({ index, depth, noise }) {
  // A directional wind field and rotating phase form a swept, twisting spine.
  const phase = depth * 1.35 + index * 2.399963 + noise * .7;
  return { x: 255 + Math.sin(phase) * 105 + index * 94, y: -165 - (1 + Math.cos(phase)) * 90 - index * 22 };
}

function ficus({ index, count, depth, noise, direction }) {
  // Low boughs fork outward into terraces, with occasional hanging roots.
  const side = count === 1 ? (direction || (depth % 2 ? 1 : -1)) : index < count / 2 ? -1 : 1;
  const rank = count === 1 ? 0 : Math.abs(index - (count - 1) / 2);
  const hanging = depth > 0 && index % 4 === 2;
  const reach = (depth === 0 ? 285 + rank * 115 : 180 + rank * 90) / (1 + Math.min(depth, 5) * .06);
  return { x: (hanging ? direction || side : side) * (reach + noise * 35), y: depth === 0 ? -280 - (index % 3) * 60 - noise * 30 : hanging ? 135 + noise * 35 : -185 - (index % 3) * 55 - noise * 30 };
}

const growers = { elm, maple, pine, juniper, ficus };

export function growthPreferences(nodes, species = 'elm') {
  const byId = new Map(nodes.map(node => [node.id, node])), masses = new Map(), preferences = new Map(), directions = new Map();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    masses.set(node.id, 1 + node.children.reduce((sum, id) => sum + (masses.get(id) ?? 0), 0));
  }
  const grow = growers[species] ?? elm;
  for (const node of nodes) {
    const children = node.children.filter(id => byId.has(id));
    const leader = children.reduce((best, id, index) => masses.get(id) > (masses.get(children[best]) ?? -1) ? index : best, 0);
    children.forEach((id, index) => {
      const offset = grow({ index, count: children.length, leader, depth: node.depth, noise: variation(byId.get(id)), direction: directions.get(node.id) ?? 0, mass: masses.get(id) });
      preferences.set(id, offset);
      directions.set(id, Math.sign(offset.x) || directions.get(node.id) || 1);
    });
  }
  return preferences;
}
