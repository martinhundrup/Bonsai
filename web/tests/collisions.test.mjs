import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, collisionBox } from '../src/collisions.js';

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
