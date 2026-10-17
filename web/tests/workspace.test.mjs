import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankTree, serializeWorkspace, deserializeWorkspace, loadWorkspace, saveWorkspace, STORAGE_KEY } from '../src/workspace.js';
import { addNode, createDocument, deleteNode, pathId, prune, toggleNode } from '../src/core.js';
import { species } from '../src/species.js';
import { branchLayout, POT_NODE, POT_ID } from '../src/graph.js';
import { CollisionWorld } from '../src/collisions.js';

test('a new blank tree is an empty pot with no imported data or undo history', () => {
  const doc = createBlankTree('My maple', 'maple');
  assert.equal(doc.empty, true); assert.equal(doc.nodes.length, 0); assert.equal(doc.history.length, 0);
  assert.equal(doc.species, 'maple');
  const restored = deserializeWorkspace(serializeWorkspace({ documents: [doc], activeId: doc.id })).documents[0];
  assert.equal(restored.empty, true);
  addNode(restored, null, '', { branch: [] });
  assert.deepEqual(prune(restored), { branch: [] });
});

test('bench restores distinct trees, stable edited array IDs, pruning, species, and placement', () => {
  const a = createDocument('Same name.json', { items: ['first', 'second', 'third'] }, { species: 'juniper' });
  deleteNode(a, pathId(['items', '0']));
  toggleNode(a, pathId(['items', '2']));
  const newId = addNode(a, pathId(['items']), '', { leaves: true });
  a.collapsed = new Set([newId]); a.selected = newId;
  a.camera = { x: 180, y: 140, scale: .9 };
  a.arrangement = { positions: new Map([['[]', { x: 30, y: -24 }]]), preferences: new Map([[newId, { x: 50, y: -180 }]]), pot: { ...POT_NODE, x: 40, y: 140 }, species: a.species };
  const b = createBlankTree('Same name.json', 'pine');
  const saved = serializeWorkspace({ documents: [a, b], activeId: b.id });
  const restored = deserializeWorkspace(saved);
  const [copy, blank] = restored.documents;
  assert.equal(restored.activeId, b.id); assert.equal(copy.id, a.id); assert.notEqual(copy.id, blank.id);
  assert.deepEqual(prune(copy), { items: ['second', { leaves: true }] });
  assert.equal(copy.species, 'juniper'); assert.equal(blank.species, 'pine');
  assert.ok(copy.byId.has(newId)); assert.ok(copy.collapsed.has(newId)); assert.equal(copy.selected, newId);
  assert.deepEqual(copy.arrangement.positions, a.arrangement.positions);
  assert.deepEqual(copy.arrangement.preferences, a.arrangement.preferences);
  assert.deepEqual(copy.camera, a.camera);
  assert.equal(deserializeWorkspace(saved, a.id).activeId, a.id);
  assert.equal(deserializeWorkspace(saved, 'missing').activeId, b.id);
});

test('all JSON root values and special keys survive persistence', () => {
  for (const value of [null, false, 0, '', [], {}, JSON.parse('{"__proto__":{"safe":true}}')]) {
    const doc = createDocument('root', value);
    const copy = deserializeWorkspace(serializeWorkspace({ documents: [doc], activeId: doc.id })).documents[0];
    assert.equal(copy.empty, false); assert.deepEqual(prune(copy), value);
  }
  assert.deepEqual(deserializeWorkspace(serializeWorkspace({ documents: [], activeId: null })), { documents: [], activeId: null });
  assert.throws(() => deserializeWorkspace('{broken'));
  assert.throws(() => deserializeWorkspace('{"version":99,"documents":[]}'));
});

test('species produce distinct, collision-free branch shapes without changing JSON', () => {
  const doc = createDocument('tree', { a: { leaf: 1 }, b: { leaf: 2 }, c: { leaf: 3 } });
  const pot = { node: POT_NODE, x: 0, y: 116 };
  const layouts = species.map(style => {
    const positions = branchLayout(doc.nodes, new Map(), new Map(), [pot], style);
    const items = [...positions].map(([id, position]) => ({ node: doc.byId.get(id), ...position }));
    const world = new CollisionWorld([...items, pot]);
    for (const item of [...items, pot]) assert.equal(world.canPlace(item), true);
    assert.deepEqual(prune(doc), doc.data);
    assert.ok(!positions.has(POT_ID));
    return JSON.stringify([...positions]);
  });
  assert.equal(new Set(layouts).size, species.length);
});

test('browser storage restores without cookies, preserves corrupt saves, and surfaces quota errors', t => {
  const originals = Object.fromEntries(['localStorage', 'document', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { get cookie() { throw new Error('Cookies blocked'); } } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:' } });
  const fresh = loadWorkspace();
  assert.equal(fresh.documents.length, 1); assert.equal(fresh.documents[0].empty, true);
  saveWorkspace(fresh);
  assert.equal(loadWorkspace().activeId, fresh.activeId);
  values.set(STORAGE_KEY, '{broken');
  assert.ok(loadWorkspace().storageError);
  assert.equal(values.get(STORAGE_KEY), '{broken');
  globalThis.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => saveWorkspace(fresh), /Quota exceeded/);
});
