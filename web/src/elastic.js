import { CollisionWorld } from './collisions.js';

const length = point => Math.hypot(point.x, point.y);
const limit = (point, maximum) => {
  const scale = Math.min(1, maximum / (length(point) || 1));
  return { x: point.x * scale, y: point.y * scale };
};

// A hand-held branch has flexible joints. Every move still uses continuous
// collision sweeps; yielding cards remain tethered to their original positions.
export class ElasticDrag {
  constructor(scene, id) {
    this.scene = scene; this.id = id; this.held = true; this.quiet = 0;
    this.rest = new Map(); this.offsets = new Map(); this.active = new Set(); this.followers = new Set(); this.velocity = new Map();
    for (const [key, item] of scene) {
      this.rest.set(key, { x: item.x, y: item.y });
      const parent = scene.get(item.node.parent);
      if (parent) this.offsets.set(key, { x: item.x - parent.x, y: item.y - parent.y });
    }
    const stack = [id];
    while (stack.length) {
      const key = stack.pop(), item = scene.get(key);
      if (!item || item.exiting || item.pending) continue;
      this.followers.add(key); this.active.add(key); stack.push(...(item.node.children ?? []));
    }
    this.target = { ...this.rest.get(id) };
  }
  aim(point) { this.target = { ...point }; this.quiet = 0; }
  release() {
    this.held = false;
    const item = this.scene.get(this.id);
    if (item) this.target = { x: item.x, y: item.y };
    this.quiet = 0;
  }
  goal(id) {
    if (id === this.id) return this.target;
    const item = this.scene.get(id), parent = this.scene.get(item.node.parent), offset = this.offsets.get(id);
    if (this.followers.has(id) && parent && offset) return { x: parent.x + offset.x, y: parent.y + offset.y };
    return this.rest.get(id);
  }
  movable(id, visiting) {
    const item = this.scene.get(id);
    return item && item.node.kind !== 'pot' && id !== this.id && !item.exiting && !item.pending && !visiting.has(id);
  }
  translate(world, id, requested) {
    const moved = world.move([id], requested), item = this.scene.get(id);
    item.x += moved.x; item.y += moved.y;
    this.active.add(id);
    return moved;
  }
  displace(world, id, requested, visiting = new Set()) {
    if (visiting.size >= 12 || length(requested) < .001) return;
    const chain = new Set(visiting); chain.add(id);
    const moved = this.translate(world, id, requested);
    const remaining = { x: requested.x - moved.x, y: requested.y - moved.y };
    const hit = world.firstHit(id, remaining);
    if (!hit) return;
    const item = this.scene.get(id), other = this.scene.get(hit.id);
    if (!other) return;
    // Split the yielding sideways between the two cards, so canopies weave
    // around each other rather than pushing an entire row indefinitely.
    const horizontal = Math.abs(remaining.x) >= Math.abs(remaining.y);
    const sign = horizontal ? (other.y + (other.node.depth ?? 0) * .001 >= item.y + (item.node.depth ?? 0) * .001 ? 1 : -1) : (other.x >= item.x ? 1 : -1);
    const nudge = Math.min(6, length(remaining) * .8);
    const side = horizontal ? { x: 0, y: sign * nudge } : { x: sign * nudge, y: 0 };
    if (this.movable(hit.id, chain)) {
      this.displace(world, hit.id, side, chain);
      this.displace(world, hit.id, remaining, chain);
    }
    if (id !== this.id) this.translate(world, id, { x: -side.x, y: -side.y });
    this.translate(world, id, remaining);
  }
  step(dt = 1 / 60, direct = false) {
    dt = Math.min(1 / 30, Math.max(.001, dt));
    const items = [...this.scene.values()].filter(item => !item.pending && (item.opacity ?? 1) > .001);
    const world = new CollisionWorld(items);
    let movement = 0, error = 0;
    const root = this.scene.get(this.id);
    if (!root) return false;
    const before = new Map([...this.active].map(id => [id, { x: this.scene.get(id).x, y: this.scene.get(id).y }]));
    // Small swept increments also bound recursive contact work on fast drags.
    const desired = limit({ x: this.target.x - root.x, y: this.target.y - root.y }, direct ? 4800 : 2400 * dt);
    const steps = Math.max(1, Math.ceil(length(desired) / 12));
    for (let i = 0; i < steps; i++) this.displace(world, this.id, { x: desired.x / steps, y: desired.y / steps });
    for (const id of this.active) {
      if (id === this.id) continue;
      const item = this.scene.get(id);
      if (!item || item.pending || item.exiting || item.node.kind === 'pot') continue;
      const target = this.goal(id), dx = target.x - item.x, dy = target.y - item.y;
      const velocity = this.velocity.get(id) ?? { x: 0, y: 0 };
      velocity.x += (dx * 150 - velocity.x * 25) * dt;
      velocity.y += (dy * 150 - velocity.y * 25) * dt;
      const request = limit({ x: velocity.x * dt, y: velocity.y * dt }, 900 * dt);
      const start = { x: item.x, y: item.y };
      // Restoring stationary cards yields to the held branch. Followers can
      // nudge neighbors, while their return springs only slide along contact.
      if (this.followers.has(id) && this.held) this.displace(world, id, request);
      else this.translate(world, id, request);
      if (Math.abs(item.x - start.x - request.x) > .01) velocity.x = 0;
      if (Math.abs(item.y - start.y - request.y) > .01) velocity.y = 0;
      this.velocity.set(id, velocity);
      error = Math.max(error, Math.hypot(dx, dy));
    }
    for (const id of this.active) {
      const item = this.scene.get(id), previous = before.get(id) ?? this.rest.get(id);
      if (item && previous) movement = Math.max(movement, Math.hypot(item.x - previous.x, item.y - previous.y));
    }
    this.quiet = movement < .025 ? this.quiet + 1 : 0;
    return this.held || (this.quiet < 18 && (movement > .025 || error > .3));
  }
}
