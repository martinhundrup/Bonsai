import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCamera, zoomCamera, cameraViewBox, MAX_ZOOM, MIN_ZOOM } from '../src/camera.js';

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
