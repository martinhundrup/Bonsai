export const NODE_WIDTH = 216;
export const NODE_HEIGHT = 84;
export const ROOT_POT_HEIGHT = 88;
export const POT_ID = '@bonsai-pot';
export const POT_NODE = { id: POT_ID, depth: 0, kind: 'pot', parent: null, children: [] };
const GAP = 28;
const LEVEL = 168;
const BAND = 14;

// A gentle taper stops at 82% so deep JSON stays legible.
export function nodeMetrics(depth = 0, kind) {
  if (kind === 'pot') return { scale: 1, width: NODE_WIDTH, height: ROOT_POT_HEIGHT };
  const scale = 1 - Math.min(4, Math.max(0, depth)) * .045;
  return { scale, width: NODE_WIDTH * scale, height: NODE_HEIGHT * scale };
}

// Pack sibling subtrees using their silhouettes. Each subtree moves as a unit;
// the weighted balance keeps its desired parent-relative offset where possible.
// Preferences are separate from solved positions, so folding releases space
// again instead of gradually pushing the tree farther apart.
export function branchLayout(nodes, saved = new Map(), preferences = new Map(), obstacles = []) {
  if (!nodes.length) return new Map();
  const byId = new Map(nodes.map(node => [node.id, node])), plans = new Map();
  const visibleChildren = node => node.children.filter(id => byId.has(id));
  function addContour(contour, row, left, right) {
    const previous = contour.get(row);
    contour.set(row, previous ? { left: Math.min(left, previous.left), right: Math.max(right, previous.right) } : { left, right });
  }
  function translated(contour, x, y) {
    const shifted = new Map();
    for (const [row, bounds] of contour) {
      const start = Math.floor((row * BAND + y) / BAND);
      const end = Math.ceil(((row + 1) * BAND + y) / BAND) - 1;
      for (let r = start; r <= end; r++) addContour(shifted, r, bounds.left + x, bounds.right + x);
    }
    return shifted;
  }
  const childrenById = new Map(nodes.map(node => [node.id, visibleChildren(node)]));
  for (const node of nodes) {
    const children = childrenById.get(node.id);
    for (let i = 0; i < children.length; i++) {
      const id = children[i];
      if (preferences.has(id)) continue;
      const child = saved.get(id), parent = saved.get(node.id);
      const step = nodeMetrics(byId.get(id).depth).width + GAP;
      preferences.set(id, child && parent ? { x: child.x - parent.x, y: child.y - parent.y } : { x: (i - (children.length - 1) / 2) * step, y: -LEVEL });
    }
  }
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index], children = childrenById.get(node.id);
    const contour = new Map();
    const metrics = nodeMetrics(node.depth), halfWidth = (metrics.width + GAP) / 2;
    const footprintHeight = metrics.height;
    for (let row = -1; row < (footprintHeight + GAP / 2) / BAND; row++) addContour(contour, row, -halfWidth, halfWidth);
    if (node.parent === null) {
      const origin = saved.get(node.id) ?? { x: 0, y: 0 };
      for (const obstacle of obstacles) {
        const size = nodeMetrics(obstacle.node.depth, obstacle.node.kind), x = obstacle.x - origin.x, y = obstacle.y - origin.y;
        for (let row = Math.floor((y - GAP / 2) / BAND); row < Math.ceil((y + size.height + GAP / 2) / BAND); row++) addContour(contour, row, x - size.width / 2 - GAP / 2, x + size.width / 2 + GAP / 2);
      }
    }
    const envelope = new Map(), placements = [];
    // Retain manually arranged sibling order, using JSON order to break ties.
    const ordered = children.map((id, index) => ({ id, index, desired: preferences.get(id) })).sort((a, b) => a.desired.x - b.desired.x || a.index - b.index);
    let weightedShift = 0, totalWeight = 0, count = 1;
    for (const child of ordered) {
      const plan = plans.get(child.id), shape = translated(plan.contour, 0, child.desired.y);
      let x = child.desired.x;
      for (const [row, bounds] of shape) {
        const occupied = envelope.get(row);
        if (occupied) x = Math.max(x, occupied.right - bounds.left);
      }
      const placement = { id: child.id, x, y: child.desired.y, desired: child.desired };
      placements.push(placement);
      const weight = 1 + Math.log2(plan.count);
      weightedShift += (x - child.desired.x) * weight; totalWeight += weight; count += plan.count;
      for (const [row, bounds] of shape) addContour(envelope, row, bounds.left + x, bounds.right + x);
    }
    const balance = weightedShift / (totalWeight || 1);
    for (const placement of placements) placement.x -= balance;
    // Treat the parent as a fixed obstacle as well. Sweep outward from the
    // parent so no correction can push a subtree back
    // into an ancestor, even after arbitrary vertical dragging.
    function clearAndReserve(placement, direction) {
      const shape = translated(plans.get(placement.id).contour, 0, placement.y);
      for (const [row, bounds] of shape) {
        const occupied = contour.get(row);
        if (!occupied) continue;
        placement.x = direction < 0 ? Math.min(placement.x, occupied.left - bounds.right) : Math.max(placement.x, occupied.right - bounds.left);
      }
      for (const [row, bounds] of shape) addContour(contour, row, bounds.left + placement.x, bounds.right + placement.x);
    }
    const anchor = placements.findIndex(placement => placement.desired.x >= 0);
    const split = anchor < 0 ? placements.length : anchor;
    for (let i = split - 1; i >= 0; i--) clearAndReserve(placements[i], -1);
    for (let i = split; i < placements.length; i++) clearAndReserve(placements[i], 1);
    // Reserve a little of the canopy's width around its parent too. Neighboring
    // branches yield before their cards or limbs crowd the opening branch.
    let canopyLeft = -halfWidth, canopyRight = halfWidth;
    for (const bounds of contour.values()) { canopyLeft = Math.min(canopyLeft, bounds.left); canopyRight = Math.max(canopyRight, bounds.right); }
    for (let row = -1; row < (metrics.height + GAP / 2) / BAND; row++) {
      addContour(contour, row, Math.min(-halfWidth, canopyLeft * .58), Math.max(halfWidth, canopyRight * .58));
    }
    plans.set(node.id, { contour, placements, count });
  }
  const positions = new Map(), root = nodes[0], origin = saved.get(root.id) ?? { x: 0, y: 0 };
  const stack = [{ id: root.id, ...origin }];
  while (stack.length) {
    const { id, x, y } = stack.pop(); positions.set(id, { x, y });
    for (const child of plans.get(id).placements) stack.push({ id: child.id, x: x + child.x, y: y + child.y });
  }
  return positions;
}

export function branchWeights(nodes) {
  const weights = new Map();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    weights.set(node.id, Math.max(1, node.children.reduce((sum, id) => sum + (weights.get(id) ?? 1), 0)));
  }
  return weights;
}

// Closed, tapered wood ribbons share a stem before they fork. The center grain
// follows the same curve, including when cards are dragged below their parent.
export function branchPaths(parent, child, parentWeight = 1, childWeight = 1) {
  const a = parent.angle ?? 0, b = child.angle ?? 0;
  const base = Math.min(13, 2 + Math.sqrt(parentWeight) * 1.6);
  const tip = Math.min(base * .8, 1.2 + Math.sqrt(childWeight) * .85);
  const distance = Math.hypot(child.x - parent.x, child.y - parent.y);
  const stem = Math.min(30, distance * .28), bend = Math.max(24, Math.abs(parent.y - child.y) * .4);
  const fork = { x: parent.x + Math.sin(a) * stem, y: parent.y - Math.cos(a) * stem };
  const first = { x: fork.x + Math.sin(a) * bend, y: fork.y - Math.cos(a) * bend };
  const second = { x: child.x - Math.sin(b) * bend, y: child.y + Math.cos(b) * bend };
  const p = (point, angle, radius, side) => `${point.x + Math.cos(angle) * radius * side},${point.y + Math.sin(angle) * radius * side}`;
  const body = `M${p(parent,a,base,-1)} L${p(fork,a,base*.78,-1)} C${p(first,a,base*.7,-1)} ${p(second,b,tip,-1)} ${p(child,b,tip,-1)} L${p(child,b,tip,1)} C${p(second,b,tip,1)} ${p(first,a,base*.7,1)} ${p(fork,a,base*.78,1)} L${p(parent,a,base,1)} Z`;
  const grain = `M${parent.x},${parent.y} L${fork.x},${fork.y} C${first.x},${first.y} ${second.x},${second.y} ${child.x},${child.y}`;
  const midpoint = { x: (fork.x + 3 * first.x + 3 * second.x + child.x) / 8, y: (fork.y + 3 * first.y + 3 * second.y + child.y) / 8 };
  return { body, grain, base, tip, midpoint };
}

export function graphBounds(positions) {
  if (!positions.size) return { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const [, { x, y, depth, kind }] of positions) {
    const metrics = nodeMetrics(depth, kind), height = metrics.height;
    left = Math.min(left, x - metrics.width / 2 - 32); right = Math.max(right, x + metrics.width / 2 + 32);
    top = Math.min(top, y - 32); bottom = Math.max(bottom, y + height + 32);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
