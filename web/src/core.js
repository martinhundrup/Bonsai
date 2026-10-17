// JSON paths are encoded as arrays so keys containing /, dots, or ~ stay distinct.
import { nodeAppearance } from './appearance.js';
import { normalizePotSettings } from './pot.js';
export const pathId = path => JSON.stringify(path);
export const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
export const canAddChild = node => !!node && ['object', 'array', 'null'].includes(node.type);

export function parseJson(text) {
  const clean = text.replace(/^\uFEFF/, '');
  try { return JSON.parse(clean); }
  catch (error) {
    const match = error.message.match(/position (\d+)/);
    const position = match ? Number(match[1]) : null;
    const before = position === null ? '' : clean.slice(0, position);
    const location = position === null ? '' : `Line ${before.split('\n').length}, column ${before.length - before.lastIndexOf('\n')}. `;
    throw new Error(`${location}${error.message}`);
  }
}

export function createDocument(name, data, options = {}) {
  const { nodeIds, freshIds = false, ...documentOptions } = options;
  const nodes = [], byId = new Map();
  const stack = [{ value: data, path: [], parent: null, key: name, depth: 0 }];
  while (stack.length) {
    const entry = stack.pop();
    if (nodes.length >= 25000) throw new Error('This file exceeds the 25,000-node limit. Try a smaller section.');
    if (entry.depth > 200) throw new Error('This file exceeds the 200-level nesting limit. Try a smaller section.');
    const type = typeOf(entry.value);
    const encoded = pathId(entry.path);
    const id = nodeIds?.get(encoded) ?? (freshIds && entry.parent !== null ? `node:${globalThis.crypto.randomUUID()}` : encoded);
    const node = { ...entry, id, type, children: [] };
    nodes.push(node); byId.set(node.id, node);
    if (entry.parent) byId.get(entry.parent).children.push(node.id);
    if (type === 'object' || type === 'array') {
      const entries = Object.entries(entry.value);
      if (nodes.length + stack.length + entries.length > 25000) throw new Error('This file exceeds the 25,000-node limit. Try a smaller section.');
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, value] = entries[i];
        stack.push({ value, path: [...entry.path, key], parent: node.id, key, depth: entry.depth + 1 });
      }
    }
  }
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name, data, nodes, byId, excluded: new Set(), collapsed: new Set(nodes.filter(n => n.depth >= 1 && n.children.length).map(n => n.id)),
    selected: '[]', history: [], future: [], camera: null, sample: false, empty: false, ...documentOptions,
  };
}

export function isIncluded(doc, node) {
  let current = node;
  while (current) {
    if (doc.excluded.has(current.id)) return false;
    current = current.parent === null ? null : doc.byId.get(current.parent);
  }
  return true;
}

export function toggleNode(doc, id) {
  if (id === '[]' || !doc.byId.has(id)) return;
  remember(doc);
  if (doc.excluded.has(id)) doc.excluded.delete(id); else doc.excluded.add(id);
}

export function restoreAll(doc) {
  if (!doc.excluded.size) return;
  remember(doc); doc.excluded.clear();
}

function snapshot(doc) {
  return { name: doc.name, data: doc.data, nodes: doc.nodes, byId: doc.byId, excluded: new Set(doc.excluded), collapsed: new Set(doc.collapsed), selected: doc.selected, empty: doc.empty, potSettings: doc.potSettings };
}
function remember(doc) {
  doc.history.push(snapshot(doc));
  if (doc.history.length > 100) doc.history.shift();
  doc.future = [];
}

export function undo(doc) {
  if (!doc.history.length) return;
  doc.future.push(snapshot(doc)); Object.assign(doc, doc.history.pop());
}

export function setNodeAppearance(doc, id, patch, checkpoint = true) {
  if (!doc.byId.has(id)) return;
  if (checkpoint) remember(doc);
  doc.nodes = doc.nodes.map(node => node.id === id ? { ...node, appearance: nodeAppearance({ ...node.appearance, ...patch }) } : node);
  doc.byId = new Map(doc.nodes.map(node => [node.id, node]));
}

export function setAllNodeAppearance(doc, patch, checkpoint = true) {
  let changed = false;
  const nodes = doc.nodes.map(node => {
    const current = nodeAppearance(node.appearance), appearance = nodeAppearance({ ...current, ...patch });
    if (current.size === appearance.size && current.rounding === appearance.rounding) return node;
    changed = true;
    return { ...node, appearance };
  });
  if (!changed) return false;
  if (checkpoint) remember(doc);
  doc.nodes = nodes;
  doc.byId = new Map(nodes.map(node => [node.id, node]));
  return true;
}

export function setPotSettings(doc, patch, checkpoint = true) {
  if (checkpoint) remember(doc);
  doc.potSettings = normalizePotSettings({ ...doc.potSettings, ...patch });
}

export function redo(doc) {
  if (!doc.future.length) return;
  doc.history.push(snapshot(doc)); Object.assign(doc, doc.future.pop());
}

function changeAt(value, path, change) {
  if (!path.length) return change(value);
  const [key, ...rest] = path;
  const copy = Array.isArray(value) ? value.slice() : Object.defineProperties({}, Object.getOwnPropertyDescriptors(value));
  Object.defineProperty(copy, key, { value: changeAt(value[key], rest, change), enumerable: true, writable: true, configurable: true });
  return copy;
}
function rebuild(doc, data, nodeIds, selected, expand, name = doc.name) {
  // Build and validate first, so a rejected edit leaves history and data intact.
  const next = createDocument(name, data, { nodeIds, freshIds: true });
  next.nodes = next.nodes.map(node => doc.byId.get(node.id)?.appearance ? { ...node, appearance: doc.byId.get(node.id).appearance } : node);
  next.byId = new Map(next.nodes.map(node => [node.id, node]));
  next.excluded = new Set([...doc.excluded].filter(id => next.byId.has(id)));
  next.collapsed = new Set([...doc.collapsed].filter(id => next.byId.has(id)));
  if (expand) next.collapsed.delete(expand);
  remember(doc);
  Object.assign(doc, { name, data, nodes: next.nodes, byId: next.byId, excluded: next.excluded, collapsed: next.collapsed, empty: false, selected: next.byId.has(selected) ? selected : '[]' });
  return next;
}

export function replaceDocumentData(doc, data) {
  if (!doc.empty && JSON.stringify(data) === JSON.stringify(doc.data)) return;
  const ids = new Map(doc.nodes.map(node => [pathId(node.path), node.id]));
  rebuild(doc, data, ids, doc.selected);
}

export function editNode(doc, id, key, value) {
  const node = doc.byId.get(id);
  if (!node) throw new Error('This node no longer exists.');
  const parent = doc.byId.get(node.parent);
  const renaming = parent?.type === 'object' && key !== node.key;
  if (renaming && Object.hasOwn(parent.value, key)) throw new Error('That key already exists. Choose another key.');
  const name = node.parent === null ? key.trim() : doc.name;
  if (!name) throw new Error('Give this tree a name.');
  if (!renaming && name === doc.name && JSON.stringify(value) === JSON.stringify(node.value)) return;
  const data = renaming ? changeAt(doc.data, parent.path, current => {
    const copy = {};
    for (const existing of Object.keys(current)) Object.defineProperty(copy, existing === node.key ? key : existing, {
      value: existing === node.key ? value : current[existing], enumerable: true, writable: true, configurable: true,
    });
    return copy;
  }) : changeAt(doc.data, node.path, () => value);
  const ids = new Map();
  for (const existing of doc.nodes) {
    const path = [...existing.path];
    if (renaming && path.length >= node.path.length && node.path.every((part, index) => path[index] === part)) path[node.path.length - 1] = key;
    ids.set(pathId(path), existing.id);
  }
  rebuild(doc, data, ids, id, undefined, name);
}
export function addNode(doc, parentId, key, value) {
  if (doc.empty) {
    const next = rebuild(doc, value, new Map(), '[]');
    return next.nodes[0].id;
  }
  const parent = doc.byId.get(parentId);
  if (!canAddChild(parent)) throw new Error('Choose an object or array, or a null node to grow.');
  const childKey = parent.type === 'array' ? String(parent.children.length) : key;
  if (parent.type === 'object' && Object.hasOwn(parent.value, childKey)) throw new Error('That key already exists. Choose another key.');
  const data = changeAt(doc.data, parent.path, current => {
    if (parent.type === 'array') return [...current, value];
    const copy = current === null ? {} : Object.defineProperties({}, Object.getOwnPropertyDescriptors(current));
    Object.defineProperty(copy, childKey, { value, enumerable: true, writable: true, configurable: true });
    return copy;
  });
  const ids = new Map(doc.nodes.map(node => [pathId(node.path), node.id]));
  const next = rebuild(doc, data, ids, parentId, parentId);
  const added = next.nodes.find(node => pathId(node.path) === pathId([...parent.path, childKey]));
  doc.selected = added.id;
  return added.id;
}
export function deleteAllNodes(doc) {
  if (!doc.nodes.length) return;
  remember(doc);
  Object.assign(doc, { data: undefined, nodes: [], byId: new Map(), excluded: new Set(), collapsed: new Set(), selected: null, empty: true });
}
export function deleteNode(doc, id) {
  const node = doc.byId.get(id);
  if (!node) return;
  if (node.parent === null) { deleteAllNodes(doc); return; }
  const parent = doc.byId.get(node.parent), removed = new Set(), stack = [id];
  while (stack.length) { const next = stack.pop(); removed.add(next); stack.push(...doc.byId.get(next).children); }
  const data = changeAt(doc.data, parent.path, current => {
    if (parent.type === 'array') { const copy = current.slice(); copy.splice(Number(node.key), 1); return copy; }
    const copy = Object.defineProperties({}, Object.getOwnPropertyDescriptors(current)); delete copy[node.key]; return copy;
  });
  const ids = new Map();
  for (const existing of doc.nodes) {
    if (removed.has(existing.id)) continue;
    const path = [...existing.path];
    if (parent.type === 'array' && path.length > parent.path.length && parent.path.every((key, index) => path[index] === key) && Number(path[parent.path.length]) > Number(node.key)) path[parent.path.length] = String(Number(path[parent.path.length]) - 1);
    ids.set(pathId(path), existing.id);
  }
  rebuild(doc, data, ids, removed.has(doc.selected) ? parent.id : doc.selected);
}

export function prune(doc) {
  // Rebuild from the leaves without mutating the source. defineProperty protects
  // ordinary JSON keys such as __proto__ from invoking prototype setters.
  const built = new Map();
  for (let i = doc.nodes.length - 1; i >= 0; i--) {
    const node = doc.nodes[i];
    if (doc.excluded.has(node.id)) continue;
    let value = node.value;
    if (node.type === 'array') value = node.children.filter(id => built.has(id)).map(id => built.get(id));
    if (node.type === 'object') {
      value = {};
      for (const id of node.children) {
        if (!built.has(id)) continue;
        Object.defineProperty(value, doc.byId.get(id).key, { value: built.get(id), enumerable: true, writable: true, configurable: true });
      }
    }
    built.set(node.id, value);
  }
  return built.get('[]');
}

export function visibleNodes(doc, query = '') {
  if (!doc.nodes.length) return [];
  const normalized = query.trim().toLowerCase();
  let matches = null;
  if (normalized) {
    matches = new Set(['[]']);
    for (const node of doc.nodes) {
      const value = node.type === 'object' || node.type === 'array' ? '' : JSON.stringify(node.value);
      if (!`${node.key} ${value}`.toLowerCase().includes(normalized)) continue;
      let current = node;
      while (current) { matches.add(current.id); current = current.parent === null ? null : doc.byId.get(current.parent); }
    }
  }
  const visible = [], stack = [doc.nodes[0]];
  while (stack.length) {
    const node = stack.pop();
    if (matches && !matches.has(node.id)) continue;
    visible.push(node);
    if (!matches && doc.collapsed.has(node.id)) continue;
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(doc.byId.get(node.children[i]));
  }
  return visible;
}

export function layoutTree(nodes) {
  if (!nodes.length) return { positions: new Map(), width: 0, height: 0 };
  const widths = new Map(), positions = new Map(), visible = new Set(nodes.map(n => n.id));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const children = n => n.children.filter(id => visible.has(id));
  let maxDepth = 0;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i], kids = children(node);
    widths.set(node.id, Math.max(188, kids.reduce((sum, id) => sum + widths.get(id), 0) + Math.max(0, kids.length - 1) * 24));
    maxDepth = Math.max(maxDepth, node.depth);
  }
  const stack = [{ node: nodes[0], left: 36 }];
  while (stack.length) {
    const { node, left } = stack.pop();
    positions.set(node.id, { x: left + widths.get(node.id) / 2, y: 40 + (maxDepth - node.depth) * 140 });
    let childLeft = left;
    for (const id of children(node)) {
      stack.push({ node: byId.get(id), left: childLeft });
      childLeft += widths.get(id) + 24;
    }
  }
  return { positions, width: widths.get(nodes[0].id) + 72, height: maxDepth * 140 + 166 };
}

export const exportName = name => `${name.replace(/\.json$/i, '')}.pruned.json`;

export const sampleData = {
  project: { name: 'A little room to grow', version: '1.0.0', environment: 'production' },
  settings: { theme: 'forest', notifications: true, language: 'en', autosave: false },
  collection: [
    { id: 1, name: 'Japanese maple', species: 'Acer palmatum', age: 12 },
    { id: 2, name: 'Juniper', species: 'Juniperus procumbens', age: 8 },
    { id: 3, name: 'Chinese elm', species: 'Ulmus parvifolia', age: 6 },
  ],
  metadata: { created: '2026-10-16', author: 'You', tags: ['nature', 'a little less'], debug: { enabled: true, level: 'verbose' } },
};
