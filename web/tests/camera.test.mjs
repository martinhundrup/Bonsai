import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCamera, zoomCamera, cameraViewBox, MAX_ZOOM, MIN_ZOOM } from '../src/camera.js';
import { nodeDetailLevel } from '../src/detail.js';

test('zoom keeps the world point beneath the pointer stationary', () => {
  const before = { x: 80.5, y: -42.25, scale: 0.6 }, point = { x: 257, y: 133 };
  const after = zoomCamera(before, 3, point);
  assert.ok(Math.abs((point.x - before.x) / before.scale - (point.x - after.x) / after.scale) < 1e-9);
  assert.ok(Math.abs((point.y - before.y) / before.scale - (point.y - after.y) / after.scale) < 1e-9);
  assert.notEqual(after.scale, before.scale);
});
test('SVG viewport reflects camera position and zoom without CSS scaling', () => {
  assert.equal(cameraViewBox({ x: 60, y: 90, scale: 3 }, { width: 900, height: 600 }), '-20 -30 300 200');
  assert.equal(zoomCamera({ x: 0, y: 0, scale: 1 }, 100, { x: 0, y: 0 }).scale, MAX_ZOOM);
  assert.equal(zoomCamera({ x: 0, y: 0, scale: 1 }, 0.0001, { x: 0, y: 0 }).scale, MIN_ZOOM);
});
test('fit places the complete tree inside the viewport', () => {
  const tree = { width: 900, height: 500 }, viewport = { width: 600, height: 400 };
  const camera = fitCamera(tree, viewport);
  assert.ok(camera.x >= 0 && camera.y >= 0);
  assert.ok(camera.x + tree.width * camera.scale <= viewport.width);
  assert.ok(camera.y + tree.height * camera.scale <= viewport.height);
});

test('detail follows projected node size rather than one global zoom cutoff', () => {
  const ordinary = { depth: 0 }, small = { depth: 4, appearance: { size: .55 } }, large = { depth: 0, appearance: { size: 1.65 } };
  assert.equal(nodeDetailLevel(ordinary, .5), 'compact');
  assert.equal(nodeDetailLevel(small, .5), 'simple');
  assert.equal(nodeDetailLevel(large, .5), 'full');
  assert.equal(nodeDetailLevel(ordinary, .32), 'compact');
  assert.equal(nodeDetailLevel(ordinary, .319), 'simple');
  assert.equal(nodeDetailLevel(ordinary, .7), 'full');
  assert.equal(nodeDetailLevel(ordinary, .699), 'compact');
  for (const node of [ordinary, small, large]) {
    assert.equal(nodeDetailLevel(node, MIN_ZOOM), 'simple');
    assert.equal(nodeDetailLevel(node, MAX_ZOOM), 'full');
  }
  assert.equal(nodeDetailLevel({ depth: 0, appearance: { size: .55 } }, 1), nodeDetailLevel({ depth: 0, appearance: { size: 1.1 } }, .5));
});
