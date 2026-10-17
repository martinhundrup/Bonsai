import { createDocument, deleteAllNodes, pathId } from './core.js';
import { getSpecies } from './species.js';
import { normalizeTrunkSettings } from './trunk.js';

export const STORAGE_KEY = 'bonsai.bench.v1';
const COOKIE = 'bonsai_active';

export function createBlankTree(name = 'Untitled bonsai.json', species = 'elm') {
  const doc = createDocument(name, null, { species: getSpecies(species).id });
  deleteAllNodes(doc);
  doc.history = [];
  return doc;
}

function saveDocument(doc) {
  const arrangement = doc.arrangement;
  return {
    id: doc.id, name: doc.name, data: doc.data, empty: doc.empty, sample: doc.sample,
    species: getSpecies(doc.species).id,
    trunkSettings: normalizeTrunkSettings(doc.trunkSettings),
    nodeIds: doc.nodes.map(node => [pathId(node.path), node.id]),
    excluded: [...doc.excluded], collapsed: [...doc.collapsed], selected: doc.selected,
    camera: doc.camera,
    arrangement: arrangement && {
      positions: [...arrangement.positions], preferences: [...arrangement.preferences],
      pot: arrangement.pot && { x: arrangement.pot.x, y: arrangement.pot.y },
      lastRoot: arrangement.lastRoot, species: arrangement.species,
    },
  };
}

export function serializeWorkspace(workspace) {
  return JSON.stringify({ version: 1, activeId: workspace.activeId, documents: workspace.documents.map(saveDocument) });
}

const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
function points(entries) {
  if (!Array.isArray(entries)) return new Map();
  return new Map(entries.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' && point(entry[1])));
}

export function deserializeWorkspace(text, selectedId) {
  const saved = JSON.parse(text);
  if (saved.version !== 1 || !Array.isArray(saved.documents)) throw new Error('Unrecognized saved bench.');
  const documents = saved.documents.map(item => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || (!item.empty && !Object.hasOwn(item, 'data'))) throw new Error('Invalid saved tree.');
    const doc = item.empty ? createBlankTree(item.name, item.species) : createDocument(item.name, item.data, { nodeIds: new Map(item.nodeIds) });
    doc.id = item.id; doc.species = getSpecies(item.species).id; doc.sample = !!item.sample;
    doc.trunkSettings = normalizeTrunkSettings(item.trunkSettings);
    doc.excluded = new Set((item.excluded ?? []).filter(id => id !== '[]' && doc.byId.has(id)));
    doc.collapsed = new Set((item.collapsed ?? []).filter(id => doc.byId.has(id)));
    doc.selected = doc.byId.has(item.selected) ? item.selected : doc.empty ? null : '[]';
    if (point(item.camera) && Number.isFinite(item.camera.scale) && item.camera.scale > 0) doc.camera = item.camera;
    if (item.arrangement) doc.arrangement = {
      positions: points(item.arrangement.positions), preferences: points(item.arrangement.preferences),
      pot: point(item.arrangement.pot) ? item.arrangement.pot : undefined,
      lastRoot: point(item.arrangement.lastRoot) ? item.arrangement.lastRoot : undefined,
      species: item.arrangement.species,
    };
    return doc;
  });
  if (new Set(documents.map(doc => doc.id)).size !== documents.length) throw new Error('Duplicate saved trees.');
  const activeId = [selectedId, saved.activeId].find(id => documents.some(doc => doc.id === id)) ?? documents[0]?.id ?? null;
  return { documents, activeId };
}

export function loadWorkspace() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    let selected;
    try {
      const cookie = document.cookie.split('; ').find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      selected = cookie && decodeURIComponent(cookie);
    } catch { /* Restore from storage even if cookies are blocked or malformed. */ }
    if (saved) return deserializeWorkspace(saved, selected);
  } catch {
    // Preserve an unreadable save for recovery instead of overwriting it.
    return { documents: [], activeId: null, storageError: 'Your saved bench could not be opened. The existing save has been preserved. Export any new work before leaving.' };
  }
  const doc = createBlankTree();
  return { documents: [doc], activeId: doc.id };
}

export function saveWorkspace(workspace) {
  localStorage.setItem(STORAGE_KEY, serializeWorkspace(workspace));
  // Tree data lives in localStorage; cookies only need the small selection ID.
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(workspace.activeId ?? '')}; Max-Age=31536000; Path=/bonsai; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch { /* Saving trees still works when cookies are blocked. */ }
}

export function clearWorkspaceStorage() {
  // Other applications share this origin. Remove only Bonsai's saved bench.
  localStorage.removeItem(STORAGE_KEY);
  for (const path of ['/bonsai', '/bonsai/', '/']) {
    document.cookie = `${COOKIE}=; Max-Age=0; Path=${path}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
}
