import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, collisionBox } from '../src/collisions.js';
import { ElasticDrag } from '../src/elastic.js';

const card = (id, x, y, depth = 1) => ({ node: { id, depth }, x, y });
function separated(world) {
  const boxes = [...world.boxes];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, p] = boxes[i], [b, q] = boxes[j];
    assert.ok(p.right <= q.left + .001 || q.right <= p.left + .001 || p.bottom <= q.top + .001 || q.bottom <= p.top + .001, `${a} overlaps ${b}`);
  }
}

test('fast dragging cannot pass through another card even when the endpoint is clear', () => {
  const world = new CollisionWorld([card('moving', 0, 0), card('fixed', 400, 0)]);
  const fixed = { ...world.boxes.get('fixed') };
  const moved = world.move(['moving'], { x: 1200, y: 0 });
  assert.ok(moved.x > 0 && moved.x < 200);
  assert.deepEqual(world.boxes.get('fixed'), fixed);
  separated(world);
});

test('a branch slides along an obstacle and can be steered around it', () => {
  const world = new CollisionWorld([card('moving', 0, 0), card('fixed', 320, 0)]);
  const moved = world.move(['moving'], { x: 500, y: -40 });
  assert.ok(moved.x < 200); assert.equal(moved.y, -40); separated(world);
  const up = world.move(['moving'], { x: 0, y: -150 });
  assert.equal(up.y, -150);
  assert.equal(world.move(['moving'], { x: 500, y: 0 }).x, 500);
  separated(world);
});

test('a collision against a descendant limits the whole branch together', () => {
  const world = new CollisionWorld([card('parent', 0, 180), card('child', 0, 0, 2), card('sibling', 320, 0)]);
  const parent = { ...world.boxes.get('parent') }, child = { ...world.boxes.get('child') }, sibling = { ...world.boxes.get('sibling') };
  const moved = world.move(['parent', 'child'], { x: 600, y: 0 });
  assert.ok(moved.x < 200);
  assert.equal(world.boxes.get('parent').left - parent.left, world.boxes.get('child').left - child.left);
  assert.deepEqual(world.boxes.get('sibling'), sibling);
  separated(world);
});

test('the pot and sway envelope reserve real collision space', () => {
  const root = { ...card('pot', 0, 110, 0), node: { id: 'pot', depth: 0, kind: 'pot' } }, world = new CollisionWorld([root]);
  assert.ok(collisionBox(root).bottom > 198);
  assert.equal(world.canPlace(card('near-pot', 0, 140)), false);
  assert.equal(world.canPlace(card('clear', 300, 140)), true);
  const bounds = collisionBox(card('leaf', 0, 0, 4));
  assert.ok(bounds.right - bounds.left > 216 * .82);
});

test('moving away from contact is free and repeated subpixel motion stays clear', () => {
  const world = new CollisionWorld([card('moving', 0, 0), card('fixed', 300, 0)]);
  for (let i = 0; i < 100; i++) { world.move(['moving'], { x: 10, y: 0 }); separated(world); }
  assert.equal(world.move(['moving'], { x: -75, y: 0 }).x, -75);
  separated(world);
});

const branchCard = (id, x, y, parent = null, children = [], depth = 1) => ({ node: { id, parent, children, depth }, x, y, opacity: 1 });

test('a dragged parent keeps moving when its child meets another branch', () => {
  const parent = branchCard('parent', 0, 180, null, ['child']);
  const child = branchCard('child', 0, 0, 'parent', [], 2);
  const neighbor = branchCard('neighbor', 320, 0);
  const pot = { ...branchCard('pot', -350, 300), node: { id: 'pot', kind: 'pot', depth: 0, children: [] } };
  const scene = new Map([parent, child, neighbor, pot].map(item => [item.node.id, item]));
  const drag = new ElasticDrag(scene, 'parent');
  let bent = false, yielded = false;
  for (let frame = 0; frame < 150; frame++) {
    drag.aim({ x: Math.min(600, frame * 6), y: 180 }); drag.step();
    bent ||= Math.abs(child.x - parent.x) > 2 || Math.abs(child.y - parent.y + 180) > 2;
    yielded ||= Math.hypot(neighbor.x - 320, neighbor.y) > 2;
    separated(new CollisionWorld([...scene.values()]));
  }
  assert.ok(parent.x > 590, 'the child must not lock its parent');
  assert.ok(bent, 'the child should flex at contact');
  assert.ok(yielded, 'neighboring branches should yield');
  assert.equal(pot.x, -350); assert.equal(pot.y, 300);
  drag.release();
  for (let frame = 0; frame < 240; frame++) { drag.step(); separated(new CollisionWorld([...scene.values()])); }
  assert.ok(Math.hypot(neighbor.x - 320, neighbor.y) < 1, 'neighbor should spring home when clear');
  assert.ok(Math.hypot(child.x - parent.x, child.y - parent.y + 180) < 1, 'child should return to its preferred joint');
});

test('fast direct contacts, crowds, and returning drags stay clear on every frame', () => {
  const items = [branchCard('hand', -400, 0, null, ['tip']), branchCard('tip', -400, -160, 'hand', [], 2)];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) items.push(branchCard(`crowd-${row}-${col}`, col * 270, row * 150 - 150));
  const scene = new Map(items.map(item => [item.node.id, item])), drag = new ElasticDrag(scene, 'hand');
  for (const target of [{ x: 1000, y: 0 }, { x: 800, y: -380 }, { x: -400, y: 0 }]) {
    drag.aim(target);
    for (let frame = 0; frame < 180; frame++) { drag.step(1 / 30); separated(new CollisionWorld([...scene.values()])); }
  }
  assert.ok(Math.hypot(items[0].x + 400, items[0].y) < 1);
  drag.release();
  let running = true;
  for (let frame = 0; frame < 600 && running; frame++) { running = drag.step(); separated(new CollisionWorld([...scene.values()])); }
  assert.equal(running, false, 'the spring simulation must sleep after settling');
});

test('a single fast pointer movement follows the hand and still cannot cross the pot', () => {
  const hand = branchCard('hand', 0, 0, null, ['leaf']);
  const leaf = branchCard('leaf', 0, -170, 'hand', [], 2);
  const pot = { ...branchCard('pot', 1000, 0), node: { id: 'pot', kind: 'pot', depth: 0, children: [] } };
  const scene = new Map([hand, leaf, pot].map(item => [item.node.id, item])), drag = new ElasticDrag(scene, 'hand');
  drag.aim({ x: 600, y: 0 }); drag.step(1 / 60, true);
  assert.equal(hand.x, 600, 'unobstructed hand movement should be immediate');
  separated(new CollisionWorld([...scene.values()]));
  drag.aim({ x: 1600, y: 0 }); drag.step(1 / 60, true);
  assert.ok(hand.x < 800); assert.equal(pot.x, 1000);
  separated(new CollisionWorld([...scene.values()]));
});
