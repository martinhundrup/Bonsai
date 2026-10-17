import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/core.js';
import { branchPaths } from '../src/graph.js';
import { species, getSpecies } from '../src/species.js';
import { trunkProfile, trunkSettings, normalizeTrunkSettings } from '../src/trunk.js';
import { serializeWorkspace, deserializeWorkspace } from '../src/workspace.js';

function fixture(spacing = 200) {
  const doc = createDocument('trunk', { a: { b: { c: { leaf: 1 } } }, side: { leaf: 2 } });
  const positions = new Map(doc.nodes.map(node => [node.id, { x: node.path[0] === 'side' ? 300 : 0, y: -node.depth * spacing }]));
  return { doc, positions, pot: { x: 0, y: 116 } };
}

test('whole-tree thickness keeps decreasing through nodes and forks for every species', () => {
  const { doc, positions, pot } = fixture();
  for (const style of species) {
    const profile = trunkProfile(doc.nodes, positions, pot, style.trunk, trunkSettings({ species: style.id }));
    for (const node of doc.nodes) {
      const edge = profile.edge(node);
      assert.ok(edge.baseRadius >= edge.tipRadius, `${style.id} thickens along an edge`);
      if (node.parent !== null) assert.ok(edge.baseRadius <= profile.edge(doc.byId.get(node.parent)).tipRadius, `${style.id} resets at a node`);
    }
    assert.ok(profile.edge(doc.nodes.at(-1)).tipRadius < profile.baseRadius);
  }
});

test('total height and species determine base girth, and customization scales it', () => {
  const short = fixture(150), tall = fixture(600), style = getSpecies('elm').trunk;
  const profile = trunkProfile(short.doc.nodes, short.positions, short.pot, style, { baseThickness: 1, taperAmount: 88 });
  const taller = trunkProfile(tall.doc.nodes, tall.positions, tall.pot, style, { baseThickness: 1, taperAmount: 88 });
  const custom = trunkProfile(short.doc.nodes, short.positions, short.pot, style, { baseThickness: 1.5, taperAmount: 88 });
  assert.ok(taller.baseRadius > profile.baseRadius);
  assert.equal(custom.baseRadius, profile.baseRadius * 1.5);
  const maple = trunkProfile(short.doc.nodes, short.positions, short.pot, getSpecies('maple').trunk, trunkSettings({ species: 'maple' }));
  const ficus = trunkProfile(short.doc.nodes, short.positions, short.pot, getSpecies('ficus').trunk, trunkSettings({ species: 'ficus' }));
  assert.ok(ficus.baseRadius > maple.baseRadius * 3.5);
  const large = fixture(10000);
  const largeDefault = trunkProfile(large.doc.nodes, large.positions, large.pot, style, { baseThickness: 1, taperAmount: 90 });
  const largeCustom = trunkProfile(large.doc.nodes, large.positions, large.pot, style, { baseThickness: 2, taperAmount: 90 });
  assert.equal(largeCustom.baseRadius, largeDefault.baseRadius * 2, 'the slider must remain responsive on very tall trees');
});

test('taper slider changes the upper branches while keeping the soil base fixed', () => {
  const doc = createDocument('single trunk', { a: { b: null } });
  const positions = new Map(doc.nodes.map(node => [node.id, { x: 0, y: -node.depth * 200 }])), pot = { x: 0, y: 116 }, style = getSpecies('pine').trunk;
  const uniform = trunkProfile(doc.nodes, positions, pot, style, { baseThickness: 1, taperAmount: 0 });
  const tapered = trunkProfile(doc.nodes, positions, pot, style, { baseThickness: 1, taperAmount: 100 });
  assert.equal(uniform.baseRadius, tapered.baseRadius);
  for (const node of doc.nodes) {
    assert.equal(uniform.edge(node).baseRadius, uniform.baseRadius);
    assert.equal(uniform.edge(node).tipRadius, uniform.baseRadius);
    assert.ok(tapered.edge(node).tipRadius < uniform.edge(node).tipRadius);
    const path = branchPaths({ x: 0, y: 100 }, { x: 0, y: 0 }, 1, 1, { ...style, ...uniform.edge(node) });
    assert.equal(path.base, path.tip);
    assert.ok(!/NaN|Infinity/.test(path.body));
  }
});

test('trunk settings persist per tree and old saves use species defaults', () => {
  const a = createDocument('a', null, { species: 'maple', trunkSettings: { baseThickness: 1.6, taperAmount: 0 } });
  const b = createDocument('b', null, { species: 'ficus' });
  const restored = deserializeWorkspace(serializeWorkspace({ documents: [a, b], activeId: a.id }));
  assert.deepEqual(trunkSettings(restored.documents[0]), { baseThickness: 1.6, taperAmount: 0 });
  assert.equal(trunkSettings(restored.documents[1]).taperAmount, getSpecies('ficus').trunk.taperAmount);
  const legacy = JSON.parse(serializeWorkspace({ documents: [b], activeId: b.id }));
  delete legacy.documents[0].trunkSettings;
  assert.deepEqual(deserializeWorkspace(JSON.stringify(legacy)).documents[0].trunkSettings, {});
  assert.deepEqual(normalizeTrunkSettings({ baseThickness: 900, taperAmount: -20 }), { baseThickness: 2, taperAmount: 0 });
  assert.deepEqual(normalizeTrunkSettings(null), {});
});
