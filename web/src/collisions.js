import { nodeMetrics } from './graph.js';

const CELL = 256, CLEARANCE = 8, EPSILON = .001;

// Reserve the full sway envelope, not just an unrotated card. The root's pot
// participates too, so animation cannot rotate visible geometry into a neighbor.
export function collisionBox(item) {
  const { width, height } = nodeMetrics(item.node.depth, item.node.kind);
  const bottom = height;
  let left = Infinity, right = -Infinity, top = Infinity, base = -Infinity;
  for (const angle of [-3, 0, 3]) {
    const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    for (const x of [-width / 2, width / 2]) for (const y of [0, bottom]) {
      const px = x * c - (y - height / 2) * s, py = height / 2 + x * s + (y - height / 2) * c;
      left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); base = Math.max(base, py);
    }
  }
  return { left: item.x + left - CLEARANCE, right: item.x + right + CLEARANCE, top: item.y + top - CLEARANCE, bottom: item.y + base + CLEARANCE };
}

const overlaps = (a, b) => a.left < b.right - EPSILON && a.right > b.left + EPSILON && a.top < b.bottom - EPSILON && a.bottom > b.top + EPSILON;
function sweep(a, b, dx, dy) {
  function times(min, max, otherMin, otherMax, delta) {
    if (!delta) return min < otherMax - EPSILON && max > otherMin + EPSILON ? [-Infinity, Infinity] : null;
    return delta > 0 ? [(otherMin - max) / delta, (otherMax - min) / delta] : [(otherMax - min) / delta, (otherMin - max) / delta];
  }
  const x = times(a.left, a.right, b.left, b.right, dx), y = times(a.top, a.bottom, b.top, b.bottom, dy);
  if (!x || !y) return null;
  const enter = Math.max(x[0], y[0]), leave = Math.min(x[1], y[1]);
  if (enter > leave || leave <= 0 || enter < -EPSILON || enter > 1) return null;
  return { time: Math.max(0, enter), blockX: x[0] >= y[0] - EPSILON, blockY: y[0] >= x[0] - EPSILON };
}

// A spatial hash keeps frame-by-frame checks local even for large documents.
// Continuous sweeps prevent tunneling on fast drags; a second tangent sweep
// lets the whole descendant branch slide along obstacles without moving them.
export class CollisionWorld {
  constructor(items = []) {
    this.boxes = new Map(); this.cells = new Map(); this.memberships = new Map();
    for (const item of items) this.add(item);
  }
  keys(box) {
    const keys = [];
    for (let x = Math.floor(box.left / CELL); x <= Math.floor(box.right / CELL); x++) {
      for (let y = Math.floor(box.top / CELL); y <= Math.floor(box.bottom / CELL); y++) keys.push(`${x}:${y}`);
    }
    return keys;
  }
  store(id, box) {
    for (const key of this.memberships.get(id) ?? []) {
      const cell = this.cells.get(key); cell.delete(id); if (!cell.size) this.cells.delete(key);
    }
    this.boxes.set(id, box);
    const keys = this.keys(box); this.memberships.set(id, keys);
    for (const key of keys) { if (!this.cells.has(key)) this.cells.set(key, new Set()); this.cells.get(key).add(id); }
  }
  nearby(box) {
    const ids = new Set();
    for (const key of this.keys(box)) for (const id of this.cells.get(key) ?? []) ids.add(id);
    return ids;
  }
  canPlace(item) {
    const box = collisionBox(item);
    for (const id of this.nearby(box)) if (id !== item.node.id && overlaps(box, this.boxes.get(id))) return false;
    return true;
  }
  add(item) { this.store(item.node.id, collisionBox(item)); }
  move(ids, requested) {
    const moving = new Set(ids), total = { x: 0, y: 0 };
    let dx = requested.x, dy = requested.y;
    for (let pass = 0; pass < 3 && Math.hypot(dx, dy) > EPSILON; pass++) {
      let time = 1, blockX = false, blockY = false;
      for (const id of moving) {
        const box = this.boxes.get(id); if (!box) continue;
        const swept = { left: Math.min(box.left, box.left + dx), right: Math.max(box.right, box.right + dx), top: Math.min(box.top, box.top + dy), bottom: Math.max(box.bottom, box.bottom + dy) };
        for (const other of this.nearby(swept)) {
          if (moving.has(other)) continue;
          const hit = sweep(box, this.boxes.get(other), dx, dy); if (!hit) continue;
          if (hit.time < time - 1e-9) { time = hit.time; blockX = hit.blockX; blockY = hit.blockY; }
          else if (Math.abs(hit.time - time) < 1e-9) { blockX ||= hit.blockX; blockY ||= hit.blockY; }
        }
      }
      const distance = Math.hypot(dx, dy), allowed = blockX || blockY ? Math.max(0, time - EPSILON / Math.max(1, distance)) : 1;
      const mx = dx * allowed, my = dy * allowed;
      for (const id of moving) {
        const box = this.boxes.get(id); if (!box) continue;
        this.store(id, { left: box.left + mx, right: box.right + mx, top: box.top + my, bottom: box.bottom + my });
      }
      total.x += mx; total.y += my;
      if (!blockX && !blockY) break;
      dx = blockX ? 0 : dx * (1 - allowed); dy = blockY ? 0 : dy * (1 - allowed);
    }
    return total;
  }
}
