import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, replaceDocumentData, editNode, setNodeAppearance, prune, undo, redo } from '../src/core.js';
import { createBlankTree, serializeWorkspace, deserializeWorkspace } from '../src/workspace.js';

test('source replacement preserves surviving nodes, appearance, pruning and tree settings', () => {
  const doc = createDocument('Tree', { branch: { leaf: 1 }, hidden: 2 }, { species: 'maple', potSettings: { preset: 'ivory', size: 1.2 } });
  setNodeAppearance(doc, '["branch"]', { size: 1.5, rounding: .7 });
  doc.excluded.add('["hidden"]'); doc.collapsed.add('["branch"]');
  doc.camera = { x: 10, y: 20, scale: .8 }; doc.arrangement = { positions: new Map(), preferences: new Map() };
  const id = doc.id, camera = doc.camera, arrangement = doc.arrangement, history = doc.history.length;
  replaceDocumentData(doc, { branch: { leaf: 'edited', added: null }, hidden: 2 });
  assert.equal(doc.id, id); assert.equal(doc.camera, camera); assert.equal(doc.arrangement, arrangement);
  assert.deepEqual(doc.byId.get('["branch"]').appearance, { size: 1.5, rounding: .7 });
  assert.equal(doc.byId.get('["branch","leaf"]').value, 'edited');
  assert.ok(doc.excluded.has('["hidden"]')); assert.ok(doc.collapsed.has('["branch"]'));
  assert.deepEqual(prune(doc), { branch: { leaf: 'edited', added: null } });
  assert.equal(doc.history.length, history + 1);
  assert.equal(doc.species, 'maple'); assert.deepEqual(doc.potSettings, { preset: 'ivory', size: 1.2 });
  undo(doc); assert.deepEqual(doc.data, { branch: { leaf: 1 }, hidden: 2 });
  redo(doc); assert.equal(doc.byId.get('["branch","leaf"]').value, 'edited');
});

test('renaming a branch retains descendant identities, appearance, order and undo state', () => {
  const doc = createDocument('Tree', { before: 0, branch: { leaf: 1 }, after: 2 });
  setNodeAppearance(doc, '["branch"]', { size: .8 });
  doc.selected = '["branch","leaf"]'; doc.excluded.add('["branch","leaf"]');
  editNode(doc, '["branch"]', 'renamed', { leaf: 3, bud: true });
  assert.deepEqual(Object.keys(doc.data), ['before', 'renamed', 'after']);
  assert.deepEqual(doc.byId.get('["branch"]').path, ['renamed']);
  assert.deepEqual(doc.byId.get('["branch","leaf"]').path, ['renamed', 'leaf']);
  assert.deepEqual(doc.byId.get('["branch"]').appearance, { size: .8, rounding: 0 });
  assert.ok(doc.excluded.has('["branch","leaf"]'));
  assert.deepEqual(prune(doc), { before: 0, renamed: { bud: true }, after: 2 });
  undo(doc); assert.equal(doc.byId.get('["branch","leaf"]').value, 1); assert.equal(doc.selected, '["branch","leaf"]');
  redo(doc); assert.equal(doc.selected, '["branch"]');
  const restored = deserializeWorkspace(serializeWorkspace({ documents: [doc], activeId: doc.id })).documents[0];
  assert.deepEqual(restored.data, doc.data); assert.deepEqual(restored.byId.get('["branch"]').appearance, doc.byId.get('["branch"]').appearance);
});

test('root name and value edit together and undo restores both', () => {
  const doc = createDocument('Old tree.json', { old: 1 });
  editNode(doc, '[]', 'New tree.json', [false, 'leaf']);
  assert.equal(doc.name, 'New tree.json'); assert.equal(doc.nodes[0].key, 'New tree.json'); assert.deepEqual(doc.data, [false, 'leaf']);
  undo(doc); assert.equal(doc.name, 'Old tree.json'); assert.equal(doc.nodes[0].key, 'Old tree.json'); assert.deepEqual(doc.data, { old: 1 });
  redo(doc); assert.equal(doc.name, 'New tree.json'); assert.deepEqual(doc.data, [false, 'leaf']);
  assert.throws(() => editNode(doc, '[]', '   ', null), /name/);
});

test('duplicate keys are rejected and special or empty keys are safe', () => {
  const doc = createDocument('Tree', { branch: { safe: true }, other: 1 });
  const original = doc.data;
  assert.throws(() => editNode(doc, '["branch"]', 'other', null), /already exists/);
  assert.equal(doc.data, original); assert.equal(doc.history.length, 0);
  editNode(doc, '["branch"]', '__proto__', { safe: false });
  assert.equal(Object.getPrototypeOf(doc.data), Object.prototype);
  assert.ok(Object.hasOwn(doc.data, '__proto__')); assert.deepEqual(doc.data.__proto__, { safe: false });
  editNode(doc, '["branch"]', '', 'empty key');
  assert.equal(doc.data[''], 'empty key'); assert.equal({}.safe, undefined);
});

test('array item edits retain their index and identity while allowing type changes', () => {
  const doc = createDocument('Tree', [null, { leaf: 1 }, true]);
  editNode(doc, '["1"]', 'ignored name', { leaf: 'new' });
  assert.deepEqual(doc.data, [null, { leaf: 'new' }, true]);
  assert.equal(doc.byId.get('["1","leaf"]').value, 'new');
  editNode(doc, '["1"]', '1', 'now a string');
  assert.equal(doc.byId.get('["1"]').type, 'string'); assert.ok(!doc.byId.has('["1","leaf"]'));
  undo(doc); assert.equal(doc.byId.get('["1","leaf"]').value, 'new');
});

test('all root values can be applied to a blank pot without an import', () => {
  for (const value of [null, false, 0, '', [], {}]) {
    const doc = createBlankTree(); replaceDocumentData(doc, value);
    assert.equal(doc.empty, false); assert.deepEqual(doc.data, value); assert.equal(doc.nodes[0].id, '[]');
    undo(doc); assert.equal(doc.empty, true); redo(doc); assert.deepEqual(doc.data, value);
  }
});

test('rejected oversized edits and unchanged values leave history and source intact', () => {
  const doc = createDocument('Tree', { leaf: 1 });
  const original = doc.data, tooDeep = {}; let value = tooDeep;
  for (let index = 0; index < 205; index++) value = value.child = {};
  assert.throws(() => replaceDocumentData(doc, tooDeep), /200-level/);
  assert.throws(() => editNode(doc, '["leaf"]', 'new name', tooDeep), /200-level/);
  assert.equal(doc.data, original); assert.equal(doc.history.length, 0);
  replaceDocumentData(doc, { leaf: 1 }); editNode(doc, '["leaf"]', 'leaf', 1);
  assert.equal(doc.history.length, 0);
});
