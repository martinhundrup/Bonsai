import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, visibleNodes, pathId } from '../src/core.js';
import { branchLayout, branchPaths, branchWeights, graphBounds, nodeMetrics, NODE_WIDTH, NODE_HEIGHT, ROOT_POT_HEIGHT, POT_ID, POT_NODE } from '../src/graph.js';
import { fitCamera } from '../src/camera.js';

function noOverlap(positions, nodes) {
  const sizes = new Map(nodes.map(node => [node.id, { ...nodeMetrics(node.depth, node.kind), pot: 0 }]));
  const points = [...positions];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const [a, p] = points[i], [b, q] = points[j];
    const first = sizes.get(a), second = sizes.get(b);
    assert.ok(Math.abs(p.x - q.x) >= (first.width + second.width) / 2 + 27.9 || p.y >= q.y + second.height + second.pot + 27.9 || q.y >= p.y + first.height + first.pot + 27.9, `overlapping cards ${a} and ${b}`);
  }
}
const offset = (positions, child, parent) => ({ x: positions.get(child).x - positions.get(parent).x, y: positions.get(child).y - positions.get(parent).y });

test('an opening canopy pushes neighboring branches aside while the root stays anchored', () => {
  const doc = createDocument('tree.json', { a: { x: 1, y: 2, z: 3 }, b: 4, c: 5 }), preferences = new Map();
  const initial = branchLayout(visibleNodes(doc), new Map(), preferences);
  doc.collapsed.delete(pathId(['a']));
  const opened = branchLayout(visibleNodes(doc), initial, preferences);
  assert.deepEqual(opened.get('[]'), initial.get('[]'));
  assert.ok(opened.get(pathId(['b'])).x > initial.get(pathId(['b'])).x);
  assert.ok(opened.get(pathId(['c'])).x > initial.get(pathId(['c'])).x);
  noOverlap(opened, doc.nodes);
  doc.collapsed.add(pathId(['a']));
  assert.deepEqual(branchLayout(visibleNodes(doc), opened, preferences), initial, 'folding gives the space back');
});

test('neighboring subtrees move together, preserving their parent-relative geometry', () => {
  const doc = createDocument('tree.json', { a: { p: { x: 1, y: 2, z: 3 }, q: 4 }, b: { x: 1, y: 2 }, c: 3 }), preferences = new Map();
  doc.collapsed.delete(pathId(['b']));
  const before = branchLayout(visibleNodes(doc), new Map(), preferences);
  doc.collapsed.delete(pathId(['a'])); doc.collapsed.delete(pathId(['a', 'p']));
  const after = branchLayout(visibleNodes(doc), before, preferences);
  const b = pathId(['b']);
  assert.notEqual(after.get(b).x, before.get(b).x);
  for (const key of ['x', 'y']) assert.deepEqual(offset(after, pathId(['b', key]), b), offset(before, pathId(['b', key]), b));
  assert.equal(after.get(b).y, before.get(b).y);
  noOverlap(after, doc.nodes);
});

test('manual vertical placement avoids the parent and neighboring cards', () => {
  const doc = createDocument('tree.json', { a: { x: 1, y: 2, z: 3 }, b: 4, c: { x: 5 } });
  doc.collapsed.clear();
  const saved = branchLayout(visibleNodes(doc)), preferences = new Map();
  preferences.set(pathId(['a']), { x: -100, y: 0 });
  preferences.set(pathId(['b']), { x: -100, y: -168 });
  preferences.set(pathId(['c']), { x: 100, y: -20 });
  const opened = branchLayout(visibleNodes(doc), saved, preferences);
  noOverlap(opened, doc.nodes);
});

test('repeated expansion and collapse never drifts or accumulates empty space', () => {
  const doc = createDocument('tree.json', { a: { x: 1, y: { z: 2 } }, b: { x: 3, y: 4 }, c: 5 }), preferences = new Map();
  const initial = branchLayout(visibleNodes(doc), new Map(), preferences);
  let positions = initial;
  for (let i = 0; i < 20; i++) {
    doc.collapsed.clear(); positions = branchLayout(visibleNodes(doc), positions, preferences); noOverlap(positions, doc.nodes);
    doc.collapsed = new Set(doc.nodes.filter(n => n.depth > 0 && n.children.length).map(n => n.id));
    positions = branchLayout(visibleNodes(doc), positions, preferences);
    assert.deepEqual(positions, initial);
  }
});

test('arbitrary manual branch angles never push descendants into ancestors', () => {
  let seed = 481;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  const doc = createDocument('manual.json', { a: { x: 1, y: 2, z: { i: 1, j: 2 } }, b: { x: 1, y: 2 }, c: { x: 1, y: { i: 1, j: 2 } } });
  doc.collapsed.clear();
  const nodes = visibleNodes(doc);
  for (let attempt = 0; attempt < 40; attempt++) {
    const preferences = new Map(nodes.filter(n => n.parent !== null).map(n => [n.id, { x: (random() - .5) * 700, y: (random() - .9) * 330 }]));
    noOverlap(branchLayout(nodes, new Map(), preferences), nodes);
  }
});

test('searching an unopened branch and restoring the view keeps the original arrangement', () => {
  const doc = createDocument('tree.json', { a: { x: 'find me', y: 2 }, b: { z: 3 } }), preferences = new Map();
  const initial = branchLayout(visibleNodes(doc), new Map(), preferences);
  const searched = branchLayout(visibleNodes(doc, 'find me'), initial, preferences);
  noOverlap(searched, doc.nodes);
  assert.deepEqual(branchLayout(visibleNodes(doc), searched, preferences), initial);
});

test('wide and nested canopies remain collision free', () => {
  const data = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`branch${i}`, Object.fromEntries(Array.from({ length: 1 + i % 5 }, (_, j) => [`child${j}`, { x: 1, y: 2 }]))]));
  const doc = createDocument('wide.json', data), preferences = new Map();
  let positions = branchLayout(visibleNodes(doc), new Map(), preferences);
  doc.collapsed.clear(); positions = branchLayout(visibleNodes(doc), positions, preferences);
  assert.equal(positions.size, doc.nodes.length); noOverlap(positions, doc.nodes);
  assert.deepEqual(branchLayout(visibleNodes(doc), positions, preferences), positions, 'settled layout is deterministic');
});

test('wood branches share a stout stem and taper towards their tips', () => {
  const doc = createDocument('tree.json', { a: { x: 1, y: 2 }, b: 3 }), weights = branchWeights(doc.nodes);
  assert.equal(weights.get('[]'), 3); assert.equal(weights.get(pathId(['a'])), 2);
  const parent = { x: 0, y: 0 }, a = branchPaths(parent, { x: -244, y: -84 }, 3, 2), b = branchPaths(parent, { x: 244, y: -84 }, 3, 1);
  assert.ok(a.base > a.tip); assert.ok(a.tip > b.tip);
  assert.equal(a.body.split(' C')[0], b.body.split(' C')[0], 'siblings share a stem before they fork');
  assert.ok(a.body.endsWith('Z')); assert.ok(a.grain.includes('C'));
  for (const point of [{ x: 0, y: 0 }, { x: -180, y: 200 }, { x: 120, y: -200 }]) {
    const paths = branchPaths({ ...parent, angle: .03 }, { ...point, angle: -.04 }, 3, 1);
    assert.ok(!/NaN|Infinity/.test(paths.body + paths.grain));
  }
});

test('fit includes dragged cards at negative world coordinates', () => {
  const positions = new Map([['a', { x: -1200, y: -800 }], ['root', { x: 300, y: 400 }]]);
  const bounds = graphBounds(positions), viewport = { width: 900, height: 600 }, camera = fitCamera(bounds, viewport);
  for (const p of positions.values()) {
    assert.ok((p.x - NODE_WIDTH / 2) * camera.scale + camera.x >= 0);
    assert.ok((p.x + NODE_WIDTH / 2) * camera.scale + camera.x <= viewport.width);
    assert.ok(p.y * camera.scale + camera.y >= 0);
    assert.ok((p.y + NODE_HEIGHT) * camera.scale + camera.y <= viewport.height);
  }
  assert.deepEqual(branchLayout([]), new Map());
});

test('higher cards taper gently and deep branches keep a readable minimum', () => {
  const levels = [0, 1, 2, 3, 4].map(nodeMetrics);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].width < levels[i - 1].width);
    assert.ok(levels[i].height < levels[i - 1].height);
  }
  assert.equal(nodeMetrics(0).width, NODE_WIDTH);
  assert.ok(nodeMetrics(200).scale >= .82);
  assert.deepEqual(nodeMetrics(200), nodeMetrics(4));
});

test('fitting and expansion reserve the root pot as part of the graph', () => {
  const root = { x: -200, y: -100, depth: 0 }, pot = { x: 50, y: 100, depth: 0, kind: 'pot' }, positions = new Map([['[]', root], [POT_ID, pot]]);
  const bounds = graphBounds(positions), viewport = { width: 400, height: 320 }, camera = fitCamera(bounds, viewport);
  assert.ok((pot.y + ROOT_POT_HEIGHT) * camera.scale + camera.y <= viewport.height);
  assert.ok(bounds.height >= NODE_HEIGHT + ROOT_POT_HEIGHT);
  const doc = createDocument('pot.json', { a: 1, b: 2 });
  const preferences = new Map([[pathId(['a']), { x: 0, y: 130 }]]), obstacle = { node: POT_NODE, x: 0, y: 120 };
  const layout = branchLayout(visibleNodes(doc), new Map(), preferences, [obstacle]);
  layout.set(POT_ID, obstacle);
  noOverlap(layout, [...doc.nodes, POT_NODE]);
});
