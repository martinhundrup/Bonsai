import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, visibleNodes, pathId } from '../src/core.js';
import { branchLayout, branchPaths, branchWeights, graphBounds, nodeMetrics, NODE_WIDTH, NODE_HEIGHT, ROOT_POT_HEIGHT, POT_ID, POT_NODE } from '../src/graph.js';
import { fitCamera } from '../src/camera.js';
import { getSpecies, species } from '../src/species.js';
import { miniatureLayout } from '../src/miniature.js';
import { growthPreferences } from '../src/growth.js';
import { CollisionWorld } from '../src/collisions.js';

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

test('species change the trunk shape and thickness without moving attachment points', () => {
  const parent = { x: 0, y: 160 }, child = { x: 90, y: 0 };
  const paths = species.map(item => branchPaths(parent, child, 12, 2, item.trunk));
  assert.equal(new Set(paths.map(path => path.body)).size, species.length);
  for (const path of paths) { assert.ok(path.base > path.tip); assert.ok(!/NaN|Infinity/.test(path.body)); assert.ok(path.grain.startsWith('M0,160')); assert.ok(path.grain.endsWith('90,0')); }
  assert.ok(branchPaths(parent, child, 12, 2, getSpecies('ficus').trunk).base > branchPaths(parent, child, 12, 2, getSpecies('maple').trunk).base);
});

test('miniatures keep wide trees tall and include deep branches', () => {
  const wide = createDocument('wide', Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`branch${i}`, { leaf: i }])));
  let data = null; for (let i = 0; i < 85; i++) data = { shoot: data };
  const deep = createDocument('deep', data);
  for (const doc of [wide, deep]) {
    const preview = miniatureLayout(doc), positions = [...preview.positions.values()];
    assert.equal(Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y)), 74);
    assert.ok(preview.nodes.length <= 280);
    assert.ok(positions.every(p => p.x >= 34 && p.x <= 126 && p.y >= 12 && p.y <= 86));
  }
  assert.equal(miniatureLayout(deep).nodes.length, deep.nodes.length);
  const crowded = createDocument('crowded', Array.from({ length: 1000 }, (_, i) => i));
  const overview = miniatureLayout(crowded);
  assert.ok(overview.positions.has(pathId(['0'])));
  assert.ok(overview.positions.has(pathId(['999'])));
});

test('miniatures preserve the relative placement of manually arranged nodes', () => {
  const doc = createDocument('placed', { a: 1, b: 2 }), a = pathId(['a']), b = pathId(['b']);
  doc.arrangement = { positions: new Map([['[]', { x: 200, y: 0 }], [a, { x: 600, y: -400 }], [b, { x: -100, y: -200 }]]), pot: { x: 200, y: 116 } };
  let preview = miniatureLayout(doc);
  assert.ok(preview.positions.get(a).x > preview.positions.get(b).x);
  assert.ok(preview.positions.get(a).y < preview.positions.get(b).y);
  doc.arrangement.positions.set(a, { x: -800, y: -100 });
  preview = miniatureLayout(doc);
  assert.ok(preview.positions.get(a).x < preview.positions.get(b).x);
  assert.ok(preview.positions.get(a).y > preview.positions.get(b).y);
  doc.excluded.add(a);
  assert.equal(miniatureLayout(doc).positions.has(a), false);
});

test('species have distinct growth structures rather than rows at different spacing', () => {
  const data = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`b${i}`, { a: 1, b: 2, c: 3, d: 4 }]));
  const doc = createDocument('growth', data), children = doc.nodes[0].children;
  const rules = Object.fromEntries(species.map(style => [style.id, growthPreferences(doc.nodes, style.id)]));
  for (const style of species) {
    const prefs = rules[style.id], ys = children.map(id => prefs.get(id).y);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 70, `${style.id} should not form a straight row`);
    assert.deepEqual(growthPreferences(doc.nodes, style.id), prefs, 'growth is deterministic');
  }
  assert.ok(rules.maple.get(children[3]).y < rules.maple.get(children[0]).y - 60, 'maple grows an arched fan');
  assert.ok(Math.abs(rules.pine.get(children[0]).x) < 30, 'pine maintains an upright apex');
  assert.ok(rules.pine.get(children[1]).x * rules.pine.get(children[2]).x < 0, 'pine pads alternate sides');
  assert.ok(children.every(id => rules.juniper.get(id).x > 100), 'juniper grows with the wind');
  assert.ok([...rules.ficus.values()].some(p => p.y > 0), 'ficus has hanging aerial branches');
  assert.ok(getSpecies('ficus').trunk.thickness / getSpecies('maple').trunk.thickness > 3.5, 'trunk girth should be visibly distinct');
});

test('all species keep complex crowns collision-free, repeatable, and anchored', () => {
  const doc = createDocument('canopy', Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`limb${i}`, { a: { x: 1, y: 2 }, b: [1,2,3], c: 3, d: 4 }])));
  const root = { x: -40, y: 80 }, pot = { node: POT_NODE, x: 20, y: 220 };
  for (const style of species) {
    const preferences = new Map();
    const layout = branchLayout(doc.nodes, new Map([['[]', root]]), preferences, [pot], style);
    assert.deepEqual(layout.get('[]'), root);
    const items = [...layout].map(([id, p]) => ({ node: doc.byId.get(id), ...p }));
    const world = new CollisionWorld([...items, pot]);
    for (const item of [...items, pot]) assert.ok(world.canPlace(item), `${style.id}: overlapping ${item.node.id}`);
    assert.deepEqual(branchLayout(doc.nodes, layout, preferences, [pot], style), layout);
    const manualId = pathId(['limb0']);
    preferences.set(manualId, { x: -500, y: -260 });
    branchLayout(doc.nodes, layout, preferences, [pot], style);
    assert.deepEqual(preferences.get(manualId), { x: -500, y: -260 }, 'manual preferences survive normal layout updates');
  }
});
