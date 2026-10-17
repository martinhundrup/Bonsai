import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJsonFile } from '../src/export.js';
import { createDocument, setPotSettings, undo, redo } from '../src/core.js';
import { serializeWorkspace, deserializeWorkspace } from '../src/workspace.js';
import { cyclePotPreset, normalizePotSettings, potPresets } from '../src/pot.js';
import { nodeMetrics, POT_NODE, branchLayout } from '../src/graph.js';
import { CollisionWorld } from '../src/collisions.js';
import { getSpecies } from '../src/species.js';

test('export reports success only after the writable closes', async () => {
  let close, completed = false, written;
  const saved = exportJsonFile('tree.json', '{"leaf":null}', {
    showSaveFilePicker: async options => {
      assert.equal(options.suggestedName, 'tree.json');
      return { createWritable: async () => ({ write: async value => { written = value; }, close: () => new Promise(resolve => { close = resolve; }) }) };
    },
  }).then(result => { completed = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(written, '{"leaf":null}'); assert.equal(completed, false);
  close(); assert.equal(await saved, 'saved');
});

test('cancelled and failed exports never report saved', async () => {
  assert.equal(await exportJsonFile('tree.json', '{}', { showSaveFilePicker: async () => { throw new DOMException('Cancelled', 'AbortError'); } }), 'cancelled');
  let aborted = false;
  await assert.rejects(exportJsonFile('tree.json', '{}', {
    showSaveFilePicker: async () => ({ createWritable: async () => ({ write: async () => { throw new Error('Disk full'); }, abort: async () => { aborted = true; } }) }),
  }), /Disk full/);
  assert.equal(aborted, true);
});

test('download fallback starts a download without claiming completion', async () => {
  let clicked = false, removed = false, revoked = false;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  const result = await exportJsonFile('tree.json', '{}', {
    URL: { createObjectURL: () => 'blob:tree', revokeObjectURL: () => { revoked = true; } },
    document: { createElement: () => link, body: { append() {} } }, setTimeout: callback => callback(),
  });
  assert.equal(result, 'download'); assert.equal(link.download, 'tree.json');
  assert.ok(clicked && removed && revoked);
});

test('pot settings cycle, undo, and persist independently for every tree', () => {
  const a = createDocument('A', null), b = createDocument('B', null);
  for (const preset of potPresets) setPotSettings(a, { preset: preset.id });
  setPotSettings(a, { size: 1.5 }); setPotSettings(a, { size: 1.6 }, false);
  undo(a); assert.equal(a.potSettings.size, 1);
  redo(a); assert.equal(a.potSettings.size, 1.6);
  const restored = deserializeWorkspace(serializeWorkspace({ documents: [a, b], activeId: a.id }));
  assert.deepEqual(restored.documents[0].potSettings, { preset: 'ivory', size: 1.6 });
  assert.deepEqual(restored.documents[1].potSettings, { preset: 'terracotta', size: 1 });
  assert.equal(cyclePotPreset({ preset: 'ivory' }, 1), 'terracotta');
  assert.equal(cyclePotPreset({ preset: 'terracotta' }, -1), 'ivory');
  assert.deepEqual(normalizePotSettings({ preset: 'bad', size: 500 }), { preset: 'terracotta', size: 1.6 });
});

test('pot size contributes to collision and camera geometry', () => {
  const doc = createDocument('Tree', { a: { leaf: 1 }, b: { leaf: 2 } });
  const node = { ...POT_NODE, potSettings: { size: 1.6 } };
  assert.equal(nodeMetrics(node).width, 216 * 1.6);
  const pot = { node, x: 0, y: 140 };
  const positions = branchLayout(doc.nodes, new Map(), new Map(), [pot], getSpecies('ficus'));
  const items = [...positions].map(([id, point]) => ({ node: doc.byId.get(id), ...point }));
  const world = new CollisionWorld([...items, pot]);
  for (const item of [...items, pot]) assert.ok(world.canPlace(item));
});
