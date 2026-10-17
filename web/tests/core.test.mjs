import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson, createDocument, pathId, toggleNode, prune, isIncluded, restoreAll, undo, redo, visibleNodes, layoutTree, exportName, addNode, deleteNode, deleteAllNodes } from '../src/core.js';

test('validation accepts all JSON root types and rejects invalid syntax', () => {
  for (const value of [{ a: 1 }, [1, null], 'bonsai', 42, true, false, null]) assert.deepEqual(parseJson(JSON.stringify(value)), value);
  assert.deepEqual(parseJson('\uFEFF{"a": 1}'), { a: 1 });
  for (const invalid of ['{"a":}', '[1,]', '', 'undefined', '{"a": NaN}', '{} {}']) assert.throws(() => parseJson(invalid));
});

test('parent pruning omits its whole subtree without mutating the original', () => {
  const data = { keep: true, branch: { a: 1, b: [2, 3] } };
  const source = JSON.stringify(data), doc = createDocument('tree.json', data);
  toggleNode(doc, pathId(['branch']));
  assert.deepEqual(prune(doc), { keep: true });
  assert.equal(isIncluded(doc, doc.byId.get(pathId(['branch', 'b', '0']))), false);
  assert.equal(JSON.stringify(data), source);
  toggleNode(doc, pathId(['branch']));
  assert.deepEqual(prune(doc), data);
});

test('array pruning removes elements and reindexes, while retaining nulls', () => {
  const doc = createDocument('array.json', { items: [null, { x: 2, y: 3 }, 'remove', false] });
  toggleNode(doc, pathId(['items', '2']));
  toggleNode(doc, pathId(['items', '1', 'y']));
  assert.deepEqual(prune(doc), { items: [null, { x: 2 }, false] });
  assert.equal(JSON.stringify(prune(doc)), '{"items":[null,{"x":2},false]}');
});

test('collapse and search change visibility only, never exported data', () => {
  const doc = createDocument('nested.json', { branch: { leaf: 'find me' }, other: 3 });
  const before = JSON.stringify(prune(doc));
  assert.equal(visibleNodes(doc).length, 3);
  doc.collapsed.clear();
  assert.equal(visibleNodes(doc).length, 4);
  doc.collapsed.add('[]');
  assert.equal(visibleNodes(doc).length, 1);
  assert.deepEqual(visibleNodes(doc, 'find me').map(n => n.key), ['nested.json', 'branch', 'leaf']);
  assert.equal(JSON.stringify(prune(doc)), before);
});

test('child exclusions survive parent toggles, and undo/redo restores them', () => {
  const doc = createDocument('history.json', { a: { b: 1, c: 2 } });
  toggleNode(doc, pathId(['a', 'b']));
  toggleNode(doc, pathId(['a']));
  toggleNode(doc, pathId(['a']));
  assert.deepEqual(prune(doc), { a: { c: 2 } });
  undo(doc); assert.deepEqual(prune(doc), {});
  undo(doc); assert.deepEqual(prune(doc), { a: { c: 2 } });
  redo(doc); assert.deepEqual(prune(doc), {});
  restoreAll(doc); assert.deepEqual(prune(doc), doc.data);
  undo(doc); assert.deepEqual(prune(doc), {});
  toggleNode(doc, pathId(['a', 'c'])); assert.equal(doc.future.length, 0);
});

test('each document has independent pruning, expansion, and history', () => {
  const a = createDocument('a.json', { branch: { a: 1 } });
  const b = createDocument('a.json', { branch: { a: 1 } });
  toggleNode(a, pathId(['branch'])); a.collapsed.clear();
  assert.notEqual(a.id, b.id);
  assert.deepEqual(prune(b), b.data);
  assert.equal(b.history.length, 0);
  assert.equal(b.collapsed.size, 1);
});

test('special JSON keys cannot collide or mutate object prototypes', () => {
  const data = parseJson('{"__proto__":{"polluted":true},"constructor":1,"a.b":2,"a":{"b":3},"a/b":4,"":5,"<script>":"<img src=x onerror=alert(1)>"}');
  const doc = createDocument('special.json', data);
  toggleNode(doc, pathId(['a.b']));
  const result = prune(doc);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, '__proto__'), true);
  assert.equal({}.polluted, undefined);
  assert.equal(result.a.b, 3);
  assert.equal(result['a/b'], 4);
  assert.equal(result[''], 5);
  assert.deepEqual(JSON.parse(JSON.stringify(result)).__proto__, { polluted: true });
});

test('root stays included and empty or primitive exports remain valid JSON', () => {
  for (const value of [null, true, 'hello', 123, [], {}]) {
    const doc = createDocument('root.json', value); toggleNode(doc, '[]');
    assert.deepEqual(prune(doc), value);
    assert.deepEqual(JSON.parse(JSON.stringify(prune(doc))), value);
  }
  const doc = createDocument('all.json', [1, 2]);
  toggleNode(doc, pathId(['0'])); toggleNode(doc, pathId(['1']));
  assert.deepEqual(prune(doc), []);
});

test('tree root is below descendants and siblings do not overlap', () => {
  const doc = createDocument('layout.json', { a: { x: 1, y: 2 }, b: 3 });
  doc.collapsed.clear();
  const nodes = visibleNodes(doc), layout = layoutTree(nodes);
  for (const node of nodes) {
    const position = layout.positions.get(node.id);
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
    if (node.parent !== null) assert.ok(layout.positions.get(node.parent).y > position.y);
  }
  const x = layout.positions.get(pathId(['a', 'x'])), y = layout.positions.get(pathId(['a', 'y']));
  assert.ok(Math.abs(x.x - y.x) >= 176);
  assert.equal(layout.positions.size, nodes.length);
});

test('unusually deep files fail gracefully and exports have separate filenames', () => {
  let value = 0; for (let i = 0; i < 202; i++) value = { child: value };
  assert.throws(() => createDocument('deep.json', value), /200-level nesting/);
  assert.equal(exportName('data.JSON'), 'data.pruned.json');
  assert.equal(exportName('config'), 'config.pruned.json');
});

test('adding and deleting nodes updates JSON and participates in undo/redo', () => {
  const source = { branch: { existing: 1 } }, doc = createDocument('edit.json', source), parent = pathId(['branch']);
  const id = addNode(doc, parent, 'added', { leaf: true });
  assert.deepEqual(prune(doc), { branch: { existing: 1, added: { leaf: true } } });
  assert.equal(doc.collapsed.has(parent), false);
  deleteNode(doc, id); assert.deepEqual(prune(doc), source);
  undo(doc); assert.ok(doc.byId.has(id)); assert.deepEqual(prune(doc).branch.added, { leaf: true });
  undo(doc); assert.deepEqual(prune(doc), source);
  redo(doc); assert.ok(doc.byId.has(id));
  assert.deepEqual(source, { branch: { existing: 1 } });
});

test('array deletions reindex paths while keeping identities and exclusions intact', () => {
  const doc = createDocument('array.json', { items: [{ a: 1 }, { b: 2 }, { c: 3 }] }), parent = pathId(['items']);
  const second = pathId(['items', '1']), third = pathId(['items', '2']);
  toggleNode(doc, third); deleteNode(doc, pathId(['items', '0']));
  assert.deepEqual(doc.byId.get(second).path, ['items', '0']);
  assert.deepEqual(doc.byId.get(third).path, ['items', '1']);
  assert.deepEqual(prune(doc), { items: [{ b: 2 }] });
  const added = addNode(doc, parent, '', { d: 4 });
  assert.notEqual(added, third); assert.equal(doc.byId.size, doc.nodes.length);
  assert.deepEqual(prune(doc), { items: [{ b: 2 }, { d: 4 }] });
  undo(doc); undo(doc); assert.deepEqual(doc.byId.get(second).path, ['items', '1']);
});

test('deleting the root or all nodes leaves a recoverable empty document', () => {
  const doc = createDocument('root.json', { a: 1 });
  deleteNode(doc, '[]'); assert.equal(doc.empty, true); assert.deepEqual(visibleNodes(doc), []); assert.equal(prune(doc), undefined);
  const id = addNode(doc, null, '', [1, null]); assert.equal(id, '[]'); assert.deepEqual(prune(doc), [1, null]);
  undo(doc); assert.equal(doc.empty, true); undo(doc); assert.deepEqual(prune(doc), { a: 1 });
  deleteAllNodes(doc); undo(doc); assert.deepEqual(prune(doc), { a: 1 });
});

test('duplicate keys and invalid structure do not create history entries', () => {
  const doc = createDocument('safe.json', { a: 1 });
  assert.throws(() => addNode(doc, '[]', 'a', 2), /already exists/);
  assert.throws(() => addNode(doc, pathId(['a']), 'x', 2), /object or array/);
  assert.equal(doc.history.length, 0); assert.deepEqual(prune(doc), { a: 1 });
  addNode(doc, '[]', '__proto__', { safe: true });
  assert.equal(Object.getPrototypeOf(doc.data), Object.prototype);
  assert.equal(Object.hasOwn(prune(doc), '__proto__'), true); assert.equal({}.safe, undefined);
});

test('null branches grow into objects with stable identities and undo restores null', () => {
  for (const data of [null, { seed: null }, [null]]) {
    const doc = createDocument('seed.json', data);
    const parent = doc.nodes.find(node => node.type === 'null');
    const id = addNode(doc, parent.id, 'shoot', null);
    assert.equal(doc.byId.get(parent.id).type, 'object');
    assert.deepEqual(doc.byId.get(id).value, null);
    addNode(doc, id, 'leaf', 1);
    assert.equal(doc.byId.get(id).type, 'object');
    undo(doc); assert.equal(doc.byId.get(id).type, 'null');
    undo(doc); assert.equal(doc.byId.get(parent.id).type, 'null'); assert.deepEqual(prune(doc), data);
    redo(doc); assert.equal(doc.byId.get(parent.id).type, 'object');
  }
});

test('growing null preserves special keys and leaves source data untouched', () => {
  const source = { seed: null }, doc = createDocument('seed', source);
  addNode(doc, pathId(['seed']), '__proto__', { leaf: 1 });
  assert.deepEqual(source, { seed: null });
  assert.equal(Object.hasOwn(prune(doc).seed, '__proto__'), true);
  assert.equal({}.leaf, undefined);
});
