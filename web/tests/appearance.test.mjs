import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, setNodeAppearance, setAllNodeAppearance, undo, redo, addNode, deleteNode, prune } from '../src/core.js';
import { serializeWorkspace, deserializeWorkspace } from '../src/workspace.js';
import { nodeAppearance, appearanceSummary } from '../src/appearance.js';
import { nodeMetrics, branchLayout, POT_NODE } from '../src/graph.js';
import { CollisionWorld } from '../src/collisions.js';
import { species } from '../src/species.js';

test('node shapes survive array reindexing, edits, save/reload, and undo without changing export', () => {
  const doc = createDocument('Tree', { items: [null, null] });
  const id = '["items","1"]';
  setNodeAppearance(doc, id, { size: 1.5 });
  setNodeAppearance(doc, id, { rounding: 1 });
  undo(doc); assert.deepEqual(doc.byId.get(id).appearance, { size: 1.5, rounding: 0 });
  redo(doc); assert.deepEqual(doc.byId.get(id).appearance, { size: 1.5, rounding: 1 });
  deleteNode(doc, '["items","0"]');
  addNode(doc, id, 'leaf', true);
  const copy = deserializeWorkspace(serializeWorkspace({ documents: [doc], activeId: doc.id })).documents[0];
  assert.deepEqual(copy.byId.get(id).appearance, { size: 1.5, rounding: 1 });
  assert.deepEqual(copy.byId.get(id).path, ['items', '0']);
  assert.equal(copy.byId.get('[]').appearance, undefined);
  assert.deepEqual(prune(copy), { items: [{ leaf: true }] });
});

test('a slider gesture forms one undo step and malformed shapes are bounded', () => {
  const doc = createDocument('Tree', null);
  setNodeAppearance(doc, '[]', { size: .8 });
  setNodeAppearance(doc, '[]', { size: .6 }, false);
  undo(doc); assert.equal(doc.byId.get('[]').appearance, undefined);
  redo(doc); assert.equal(doc.byId.get('[]').appearance.size, .6);
  assert.deepEqual(nodeAppearance({ size: -100, rounding: 100 }), { size: .55, rounding: 1 });
  assert.deepEqual(nodeAppearance({ size: NaN, rounding: Infinity }), { size: 1, rounding: 0 });
  const circle = nodeMetrics({ depth: 0, appearance: { size: 1.5, rounding: 1 } });
  assert.equal(circle.width, circle.height);
  assert.equal(circle.radius, circle.localHeight / 2);
});

test('all species reserve the complete customized card footprint', () => {
  const doc = createDocument('Tree', { a: { leaf: 1 }, b: { leaf: 2 }, c: { leaf: 3 } });
  for (const node of [...doc.nodes]) setNodeAppearance(doc, node.id, { size: node.depth % 2 ? .55 : 1.65, rounding: 1 });
  const rootHeight = nodeMetrics(doc.nodes[0]).height;
  const saved = new Map([['[]', { x: 0, y: 84 - rootHeight }]]);
  const pot = { node: POT_NODE, x: 0, y: 116 };
  for (const style of species) {
    const positions = branchLayout(doc.nodes, saved, new Map(), [pot], style);
    const items = [...positions].map(([id, point]) => ({ node: doc.byId.get(id), ...point }));
    const world = new CollisionWorld([...items, pot]);
    for (const item of [...items, pot]) assert.ok(world.canPlace(item), `${style.id}: ${item.node.id}`);
  }
});

test('all-node sliders edit hidden and pruned nodes independently and undo one gesture together', () => {
  const doc = createDocument('Tree', { branch: { leaf: 1 }, other: true });
  doc.collapsed.add('["branch"]'); doc.excluded.add('["other"]');
  setNodeAppearance(doc, '["branch"]', { size: 1.5, rounding: .7 });
  const before = doc.nodes, history = doc.history.length;
  assert.equal(setAllNodeAppearance(doc, { size: .8 }), true);
  setAllNodeAppearance(doc, { size: .6 }, false);
  assert.equal(doc.history.length, history + 1);
  for (const node of doc.nodes) {
    assert.equal(node.appearance.size, .6);
    assert.equal(node.appearance.rounding, node.id === '["branch"]' ? .7 : 0);
    assert.equal(doc.byId.get(node.id), node);
  }
  undo(doc); assert.equal(doc.nodes, before);
  redo(doc); assert.ok(doc.nodes.every(node => node.appearance.size === .6));
  setAllNodeAppearance(doc, { rounding: 1 });
  assert.ok(doc.nodes.every(node => node.appearance.rounding === 1 && node.appearance.size === .6));
  assert.ok(doc.excluded.has('["other"]')); assert.ok(doc.collapsed.has('["branch"]'));
  assert.deepEqual(prune(doc), { branch: { leaf: 1 } });
  const restored = deserializeWorkspace(serializeWorkspace({ documents: [doc], activeId: doc.id })).documents[0];
  assert.ok(restored.nodes.every(node => node.appearance.size === .6 && node.appearance.rounding === 1));
  assert.equal(setAllNodeAppearance(doc, { rounding: 1 }), false, 'unchanged settings do not create undo entries');
});

test('all-node controls report mixed properties independently and handle empty trees', () => {
  const doc = createDocument('Tree', { leaf: 1 });
  assert.deepEqual(appearanceSummary(doc.nodes), { size: { value: 1, mixed: false }, rounding: { value: 0, mixed: false } });
  setNodeAppearance(doc, '[]', { size: .6, rounding: 1 });
  assert.deepEqual(appearanceSummary(doc.nodes), { size: { value: .8, mixed: true }, rounding: { value: .5, mixed: true } });
  setAllNodeAppearance(doc, { rounding: .4 });
  assert.deepEqual(appearanceSummary(doc.nodes).rounding, { value: .4, mixed: false });
  assert.equal(appearanceSummary(doc.nodes).size.mixed, true);
  assert.deepEqual(appearanceSummary(), { size: { value: 1, mixed: false }, rounding: { value: 0, mixed: false } });
  doc.nodes = []; doc.byId = new Map();
  const count = doc.history.length;
  assert.equal(setAllNodeAppearance(doc, { size: 1.2 }), false);
  assert.equal(doc.history.length, count);
});
