import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createDocument, parseJson, isIncluded, canAddChild, toggleNode, restoreAll, undo, redo, prune, visibleNodes, exportName, sampleData, addNode, deleteNode, deleteAllNodes } from './core.js';
import TreeCanvas from './components/TreeCanvas.jsx';
import BenchTree from './components/BenchTree.jsx';
import JsonPreview from './components/JsonPreview.jsx';
import GraphHeader from './components/GraphHeader.jsx';
import NodeEditor from './components/NodeEditor.jsx';
import { BrandMark, Icon, IconButton, NodeSwitch, ExpandButton, typeSymbols, typeLabel } from './components/Shared.jsx';
import { createBlankTree, loadWorkspace, saveWorkspace, clearWorkspaceStorage } from './workspace.js';
import { species, getSpecies } from './species.js';
import { trunkSettings } from './trunk.js';
import { setNodeAppearance, setAllNodeAppearance, setPotSettings, editNode, replaceDocumentData } from './core.js';
import { useEditorFullscreen } from './useEditorFullscreen.js';
import { exportJsonFile } from './export.js';

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const { documents, activeId } = workspace;
  const [saveRevision, setSaveRevision] = useState(0), [saveStatus, setSaveStatus] = useState('Saving…');
  const [saveError, setSaveError] = useState('');
  const [exportBusy, setExportBusy] = useState(false), exporting = useRef(false);
  const liveWorkspace = useRef(workspace); liveWorkspace.current = workspace;
  const markDirty = useCallback(() => setSaveRevision(value => value + 1), []);
  const [treeDraft, setTreeDraft] = useState({ name: '', species: 'elm' });
  const treeEditor = useRef(null), removingTree = useRef(null);
  const clearingBench = useRef(null), importGeneration = useRef(0);
  const [clearError, setClearError] = useState('');
  const [removeId, setRemoveId] = useState(null);
  const [view, setView] = useState('tree'), [query, setQuery] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [dropActive, setDropActive] = useState(false), [zoomPercent, setZoomPercent] = useState(100);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const fullscreen = useEditorFullscreen();
  const [draft, setDraft] = useState({ mode: 'add', nodeId: null, parentId: null, key: 'new_node', value: 'null' }), [draftError, setDraftError] = useState('');
  const nodeEditor = useRef(null);
  const fileInput = useRef(null), help = useRef(null), graphApi = useRef(null), importing = useRef(false), dragDepth = useRef(0);
  const doc = documents.find(item => item.id === activeId);
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(getSpecies(doc?.species).colors)) root.style.setProperty(name, value);
  }, [doc?.species]);
  const trunk = trunkSettings(doc);
  const nodes = useMemo(() => doc ? visibleNodes(doc, query) : [], [doc?.id, doc?.nodes, doc?.collapsed, query]);
  const output = useMemo(() => doc && !doc.empty ? JSON.stringify(prune(doc), null, 2) : null, [doc?.id, doc?.nodes, doc?.excluded, doc?.empty]);
  const source = useMemo(() => doc && !doc.empty ? JSON.stringify(doc.data, null, 2) : '', [doc?.id, doc?.data, doc?.empty]);
  const allExpanded = !!doc?.nodes.length && doc.nodes.filter(node => node.children.length).every(node => !doc.collapsed.has(node.id));

  const notify = useCallback(text => setMessage(text), []);
  const persist = useCallback(() => {
    if (liveWorkspace.current.cleared) return;
    if (liveWorkspace.current.storageError) return;
    try { saveWorkspace(liveWorkspace.current); setSaveStatus('Saved in this browser'); setSaveError(''); }
    catch { setSaveStatus('Not saved'); setSaveError('Your browser could not save the bench. Storage may be full or blocked. Export your trees to keep a copy.'); }
  }, []);
  useEffect(() => {
    if (workspace.cleared) { setSaveStatus('Bench cleared'); return; }
    if (workspace.storageError) { setSaveStatus('Not saved'); return; }
    setSaveStatus('Saving…');
    const timer = setTimeout(persist, 400);
    return () => clearTimeout(timer);
  }, [workspace, saveRevision, persist]);
  useEffect(() => {
    const leaving = () => persist();
    const hidden = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('pagehide', leaving); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', leaving); document.removeEventListener('visibilitychange', hidden); };
  }, [persist]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3200); return () => clearTimeout(timer); }, [message]);
  const editDocument = useCallback(recipe => {
    setWorkspace(workspace => ({ ...workspace, documents: workspace.documents.map(item => {
      if (item.id !== workspace.activeId) return item;
      const next = { ...item, excluded: new Set(item.excluded), history: [...item.history], future: [...item.future] };
      recipe(next); return next;
    }) }));
  }, []);
  function clearBench() {
    try {
      clearWorkspaceStorage();
      importGeneration.current++;
      const next = { documents: [], activeId: null, cleared: true };
      liveWorkspace.current = next; setWorkspace(next);
      setQuery(''); setError(''); setSaveError(''); setClearError('');
      clearingBench.current.close(); notify('Bonsai cookies and saved trees cleared.');
    } catch { setClearError('Your browser could not clear the saved bench. Please try again.'); }
  }
  const onToggle = useCallback(id => editDocument(item => toggleNode(item, id)), [editDocument]);
  const onCollapse = useCallback(id => editDocument(item => {
    item.collapsed = new Set(item.collapsed);
    if (item.collapsed.has(id)) item.collapsed.delete(id); else item.collapsed.add(id);
  }), [editDocument]);
  const onSelect = useCallback(id => editDocument(item => { item.selected = id; }), [editDocument]);
  const onAppearance = useCallback((id, patch, checkpoint) => editDocument(item => setNodeAppearance(item, id, patch, checkpoint)), [editDocument]);
  const onAllAppearance = useCallback((patch, checkpoint) => editDocument(item => setAllNodeAppearance(item, patch, checkpoint)), [editDocument]);
  const onPotChange = useCallback((patch, checkpoint) => editDocument(item => setPotSettings(item, patch, checkpoint)), [editDocument]);
  function structuralEdit(recipe) {
    const next = { ...doc, excluded: new Set(doc.excluded), collapsed: new Set(doc.collapsed), history: [...doc.history], future: [...doc.future] };
    recipe(next);
    setWorkspace(current => ({ ...current, documents: current.documents.map(item => item.id === next.id ? next : item) }));
  }
  function onAdd(parentId) {
    const parent = doc?.byId.get(parentId);
    let key = 'new_node', index = 2;
    while (parent?.type === 'object' && Object.hasOwn(parent.value, key)) key = `new_node_${index++}`;
    setDraft({ mode: 'add', nodeId: null, parentId, key, value: doc?.empty ? '{}' : 'null' }); setDraftError('');
    nodeEditor.current.showModal();
  }
  function onEdit(id) {
    const node = doc?.byId.get(id);
    if (!node) return;
    setDraft({ mode: 'edit', nodeId: id, parentId: node.parent, key: node.parent === null ? doc.name : node.key, value: JSON.stringify(node.value, null, 2) });
    setDraftError(''); nodeEditor.current.showModal();
  }
  function submitNode(event) {
    event.preventDefault();
    try {
      const value = parseJson(draft.value);
      structuralEdit(item => draft.mode === 'edit' ? editNode(item, draft.nodeId, draft.key, value) : addNode(item, draft.parentId, draft.key, value));
      setQuery(''); nodeEditor.current.close();
    }
    catch (error) { setDraftError(error.message); }
  }
  function applyJson(text) {
    const value = parseJson(text);
    structuralEdit(item => replaceDocumentData(item, value)); setQuery('');
  }
  function onDelete(id) { structuralEdit(item => deleteNode(item, id)); }

  function selectFile(id) { setWorkspace(current => ({ ...current, activeId: id })); setQuery(''); }
  function removeTree(id) {
    const closing = documents.find(item => item.id === id);
    setWorkspace(current => {
      const index = current.documents.findIndex(item => item.id === id), remaining = current.documents.filter(item => item.id !== id);
      return { ...current, documents: remaining, activeId: current.activeId === id ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null : current.activeId };
    });
    if (id === activeId) setQuery('');
    notify(`Removed ${closing.name} from your bench`);
  }
  function newTree() { setTreeDraft({ name: '', species: 'elm' }); treeEditor.current.showModal(); }
  function plantTree(event) {
    event.preventDefault();
    const name = treeDraft.name.trim() || `Bonsai ${documents.length + 1}`;
    const tree = createBlankTree(/\.json$/i.test(name) ? name : `${name}.json`, treeDraft.species);
    setWorkspace(current => ({ ...current, cleared: false, documents: [...current.documents, tree], activeId: tree.id }));
    setQuery(''); treeEditor.current.close();
  }
  function renameTree(event) {
    const name = event.target.value.trim();
    if (!name || name === doc.name) { event.target.value = doc.name; return; }
    editDocument(item => {
      item.name = name;
      item.nodes = item.nodes.map(node => node.parent === null ? { ...node, key: name } : node);
      item.byId = new Map(item.nodes.map(node => [node.id, node]));
    });
  }
  function openSample() {
    setWorkspace(current => {
      const existing = current.documents.find(item => item.sample);
      const sample = existing ?? createDocument('collection.json', sampleData, { sample: true, species: 'elm' });
      return { ...current, cleared: false, documents: existing ? current.documents : [...current.documents, sample], activeId: sample.id };
    }); setQuery('');
  }
  const importFiles = useCallback(async files => {
    if (importing.current) { notify('Finishing your previous import. Please try again in a moment.'); return; }
    importing.current = true;
    const generation = importGeneration.current;
    const errors = [], loaded = [];
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { errors.push(`${file.name}: This file is larger than the 10 MB limit.`); continue; }
        try { loaded.push(createDocument(file.name, parseJson(await file.text()), { species: 'elm' })); }
        catch (err) { errors.push(`${file.name}: ${err.message}`); }
      }
      if (generation !== importGeneration.current) return;
      if (loaded.length) {
        setWorkspace(current => ({ ...current, cleared: false, documents: [...current.documents, ...loaded], activeId: loaded[0].id })); setQuery('');
      }
      setError(errors.length ? `Couldn't import ${errors.length === 1 ? 'a file' : 'some files'}:\n${errors.join('\n')}` : '');
    } finally { importing.current = false; if (fileInput.current) fileInput.current.value = ''; }
  }, [notify]);

  const download = useCallback(async () => {
    if (!doc || output === null || exporting.current) return;
    exporting.current = true; setExportBusy(true); setMessage('');
    const name = exportName(doc.name);
    try {
      const result = await exportJsonFile(name, output + '\n');
      if (result === 'saved') notify(`Saved ${name}`);
    } catch { setError('Your browser could not save the file. Please try exporting again.'); }
    finally { exporting.current = false; setExportBusy(false); }
  }, [doc?.id, doc?.name, output, notify]);
  async function copy(text = output, label = 'Pruned JSON') {
    if (text === null) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.cssText = 'position:fixed;opacity:0'; document.body.append(textarea); textarea.select();
        const success = document.execCommand('copy'); textarea.remove(); if (!success) throw new Error('Copy unavailable');
      }
      notify(`${label} copied to clipboard.`);
    } catch { setError('Your browser could not access the clipboard. Use Export JSON to save a copy.'); }
  }

  useEffect(() => {
    function keyboard(event) {
      if (help.current?.open || nodeEditor.current?.open || treeEditor.current?.open || removingTree.current?.open || clearingBench.current?.open) return;
      if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && doc) { event.preventDefault(); editDocument(event.shiftKey ? redo : undo); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); download(); }
    }
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  }, [download, doc?.id, editDocument]);
  useEffect(() => {
    function enter(event) { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current++; setDropActive(true); }
    function over(event) { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }
    function leave(event) { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDropActive(false); }
    function reset() { dragDepth.current = 0; setDropActive(false); }
    function drop(event) { event.preventDefault(); reset(); if (event.dataTransfer.files.length) importFiles([...event.dataTransfer.files]); }
    document.addEventListener('dragenter', enter); document.addEventListener('dragover', over); document.addEventListener('dragleave', leave); document.addEventListener('drop', drop); window.addEventListener('blur', reset);
    return () => { document.removeEventListener('dragenter', enter); document.removeEventListener('dragover', over); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', drop); window.removeEventListener('blur', reset); };
  }, [importFiles]);
  function tabKey(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 'tree' : event.key === 'End' ? 'list' : view === 'tree' ? 'list' : 'tree';
    setView(next); document.getElementById(`${next}-tab`).focus();
  }
  function expandAll() {
    editDocument(item => { item.collapsed = allExpanded ? new Set(item.nodes.filter(node => node.depth > 0 && node.children.length).map(node => node.id)) : new Set(); });
  }
  const rootValue = doc?.nodes.length && !['array', 'object'].includes(doc.nodes[0].type) ? JSON.stringify(doc.data) : '';
  const noMatches = query.trim() && nodes.length === 1 && !`${doc?.name} ${rootValue}`.toLowerCase().includes(query.trim().toLowerCase());

  return <>
    <header className="app-header"><a className="brand" href="./" aria-label="Bonsai home"><span className="brand-mark"><BrandMark /></span><span>bonsai<span className="brand-dot">.</span></span></a><div className="header-right"><IconButton icon="help" label="How to use Bonsai" className="icon-button help-button" onClick={() => help.current.showModal()} /></div></header>
    <div className="app-shell">
      <aside className="sidebar" aria-label="Bonsai bench">
        <div className="bench-heading"><h2>Bonsai bench</h2><span>{documents.length} {documents.length === 1 ? 'tree' : 'trees'}</span></div>
        <div className="bench-actions"><button className="primary-button" onClick={newTree}><Icon name="plus" /> New blank tree</button><button className="import-button" onClick={() => fileInput.current.click()}><Icon name="upload" /> Import JSON</button></div><input id="file-input" ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={event => importFiles([...event.target.files])} />
        <div id="file-list" className="file-list" aria-label="Trees on your bench">{documents.map(item => <div className={`file-item ${item.id === activeId ? 'active' : ''}`} key={item.id} style={getSpecies(item.species).colors}><button className="file-select" aria-label={item.name} aria-current={item.id === activeId ? 'true' : 'false'} title={item.name} onClick={() => selectFile(item.id)}><BenchTree doc={item} revision={item.id === activeId ? saveRevision : 0} /><span className="bench-tree-label"><span className="file-name">{item.name}</span><span className="bench-tree-species">{getSpecies(item.species).name}</span></span></button><IconButton icon="close" label={`Remove ${item.name} from bench`} className="icon-button file-remove" onClick={() => { setRemoveId(item.id); removingTree.current.showModal(); }} /></div>)}</div>
        {!documents.length && <p className="bench-empty">A little room to grow. Create your first tree.</p>}
        <button className="sample-button" onClick={openSample}>Open example</button>
        <p className={`bench-save${saveError || workspace.storageError ? ' save-failed' : ''}`} role="status">{saveStatus}<span>Trees stay on this device. Export a backup to keep them elsewhere.</span></p>
        <button className="clear-bench-button" onClick={() => { setClearError(''); clearingBench.current.showModal(); }}>Clear cookies &amp; saved trees</button>
      </aside>
      <main className="main-content"><section className="document-header"><div className="tree-title"><h1 id="document-title">{doc ? <input key={`${doc.id}-${doc.name}`} className="tree-name" aria-label="Tree name" title="Rename tree" maxLength={120} defaultValue={doc.name} onBlur={renameTree} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = doc.name; event.currentTarget.blur(); } }} /> : 'Your next bonsai starts here'}</h1></div><button className="primary-button export-button" disabled={!doc || doc.empty || exportBusy} aria-busy={exportBusy} onClick={download}><Icon name="download" /> Export JSON</button></section>
        <div id="notice" className="notice" role="alert" hidden={!error}>{error}<IconButton icon="close" label="Dismiss error" onClick={() => setError('')} /></div>
        {(saveError || workspace.storageError) && <div className="notice" role="alert">{workspace.storageError || saveError}</div>}
        <div className="workspace-toolbar"><div className="view-tabs" role="tablist" aria-label="JSON layout" onKeyDown={tabKey}>{['tree', 'list'].map(tab => <button key={tab} id={`${tab}-tab`} role="tab" aria-selected={view === tab} aria-controls={`${tab}-view`} tabIndex={view === tab ? 0 : -1} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}><Icon name={tab} />{tab === 'tree' ? 'Tree view' : 'List view'}</button>)}</div><div className="toolbar-right"><label className="search-box"><Icon name="search" /><input id="search" type="search" placeholder="Search" aria-label="Search JSON keys and values" value={query} disabled={!doc} onChange={event => setQuery(event.target.value)} /></label><span className="toolbar-separator" /><IconButton id="undo-button" icon="undo" label="Undo" disabled={!doc?.history.length} onClick={() => editDocument(undo)} /><IconButton id="redo-button" icon="undo" label="Redo" className="icon-button redo" disabled={!doc?.future.length} onClick={() => editDocument(redo)} /><button id="restore-button" className="text-button" disabled={!doc?.excluded.size} onClick={() => editDocument(restoreAll)}>Restore all</button></div></div>
        <div className={`editor-grid${previewCollapsed ? ' preview-collapsed' : ''}`} style={getSpecies(doc?.species).colors}><section ref={fullscreen.panel} className={`visual-panel${fullscreen.active ? ' editor-fullscreen' : ''}`} aria-label="JSON explorer">
          <GraphHeader doc={doc} trunk={trunk} onAllAppearance={onAllAppearance} onSpecies={value => editDocument(item => { item.species = value; })} onTrunkChange={patch => editDocument(item => { item.trunkSettings = patch ? { ...item.trunkSettings, ...patch } : {}; })} onClear={() => structuralEdit(deleteAllNodes)} onExpand={expandAll} allExpanded={allExpanded} fullscreen={{ ...fullscreen, toggle: () => { setView('tree'); fullscreen.toggle(); } }} />
          <TreeCanvas doc={doc} nodes={nodes} hidden={!doc || view !== 'tree'} query={query} graphApi={graphApi} onZoom={setZoomPercent} onSelect={onSelect} onToggle={onToggle} onCollapse={onCollapse} onAdd={onAdd} onDelete={onDelete} onDirty={markDirty} onAppearance={onAppearance} onPotChange={onPotChange} onEdit={onEdit} />
          <div id="list-view" role="tabpanel" aria-labelledby="list-tab" className="list-view" hidden={!!doc && view !== 'list'}>{doc ? <><div className="list-column-labels"><span>BRANCH / VALUE</span><span>KEEP</span></div><div id="list-content">{nodes.map(node => <div key={node.id} className={`list-row ${isIncluded(doc, node) ? '' : 'off'} ${doc.selected === node.id ? 'selected' : ''}`} style={{ '--depth': Math.min(node.depth, 14) }} tabIndex={0} role="group" aria-label={`${node.key}, ${node.type}`} onClick={() => onSelect(node.id)} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect(node.id); } }}><ExpandButton doc={doc} node={node} onCollapse={onCollapse} /><span className={`type-icon ${node.type}`}>{typeSymbols[node.type]}</span><span className="list-key" title={node.key}>{node.parent === null ? '$ root' : node.key}</span><span className="list-value" title={typeLabel(node)}>{typeLabel(node)}</span><NodeSwitch doc={doc} node={node} onToggle={onToggle} />{canAddChild(node) && <IconButton icon="plus" label={`Add node to ${node.key}`} onClick={event => { event.stopPropagation(); onAdd(node.id); }} />}<IconButton icon="close" label={`Delete ${node.key}`} onClick={event => { event.stopPropagation(); onDelete(node.id); }} /></div>)}{doc.empty && <button className="primary-button empty-root-button" onClick={() => onAdd(null)}>Add root node</button>}{noMatches && <p className="empty-preview">No matching branches.</p>}</div></> : <div id="list-content" className="empty-workspace"><h2>Grow something of your own</h2><button className="primary-button" onClick={newTree}><Icon name="plus" /> New blank tree</button><button className="import-button" onClick={() => fileInput.current.click()}><Icon name="plus" /> Import JSON</button><button className="text-button" onClick={openSample}>Open example</button></div>}</div>
          <div id="graph-controls" className="graph-controls" hidden={view !== 'tree' || !doc}><IconButton icon="minus" label="Zoom out" onClick={() => graphApi.current.zoom(1 / 1.2)} /><span id="zoom-label">{zoomPercent}%</span><IconButton icon="plus" label="Zoom in" onClick={() => graphApi.current.zoom(1.2)} /><span className="control-divider" /><IconButton icon="fit" label="Fit tree to view" onClick={() => graphApi.current.fit()} /></div>
        </section><JsonPreview docId={doc?.id} source={source} output={output} onApply={applyJson} onCopy={copy} collapsed={previewCollapsed} onToggle={() => setPreviewCollapsed(value => !value)} /></div>
      </main>
    </div>
    <div id="drop-overlay" className="drop-overlay" hidden={!dropActive}><div><Icon name="upload" /><h2>Drop JSON files</h2></div></div><div id="toast" className="toast" role="status" hidden={!message}>{message}</div>
    <dialog ref={clearingBench} aria-labelledby="clear-bench-title" aria-describedby="clear-bench-description"><h2 id="clear-bench-title">Clear saved Bonsai data?</h2><p id="clear-bench-description">This removes all trees on your saved bench and the Bonsai selection cookie from this browser. Export any trees you want to keep before clearing.</p>{clearError && <p role="alert" className="editor-error">{clearError}</p>}<div className="dialog-actions"><button className="text-button" autoFocus onClick={() => clearingBench.current.close()}>Keep my trees</button><button className="primary-button" onClick={clearBench}>Clear saved data</button></div></dialog>
    <dialog ref={treeEditor} className="node-editor" style={getSpecies(treeDraft.species).colors}><form onSubmit={plantTree}><h2>A new bonsai</h2><p>Start with an empty pot, then add a root and grow your own branches.</p><label>Name<input autoFocus aria-label="New tree name" maxLength={120} placeholder="My bonsai" value={treeDraft.name} onChange={event => setTreeDraft({ ...treeDraft, name: event.target.value })} /></label><label>Species<select aria-label="Species" value={treeDraft.species} onChange={event => setTreeDraft({ ...treeDraft, species: event.target.value })}>{species.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><p className="species-hint">{getSpecies(treeDraft.species).styles}</p><div className="dialog-actions"><button type="button" className="text-button" onClick={() => treeEditor.current.close()}>Cancel</button><button type="submit" className="primary-button">Create blank tree</button></div></form></dialog>
    <dialog ref={removingTree}><h2>Remove tree from bench?</h2><p>“{documents.find(item => item.id === removeId)?.name}” will be removed from this browser’s saved bench. Export it first if you want to keep a copy.</p><div className="dialog-actions"><button className="text-button" autoFocus onClick={() => removingTree.current.close()}>Keep tree</button><button className="primary-button" onClick={() => { removeTree(removeId); removingTree.current.close(); }}>Remove tree</button></div></dialog>
    <NodeEditor doc={doc} draft={draft} error={draftError} dialogRef={nodeEditor} onDraft={setDraft} onSubmit={submitNode} />
    <dialog id="help-dialog" ref={help} onClick={event => { if (event.target !== event.currentTarget) return; const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) help.current.close(); }}><IconButton icon="close" label="Close help" className="icon-button dialog-close" onClick={() => help.current.close()} /><h2>Controls</h2><ul><li>Drag a branch to train it. Children flex around nearby cards, which gently yield and spring back. Drag the pot independently. Drag the background to pan. Scroll or pinch to zoom.</li><li>Use + and − to expand or collapse branches. Switch a branch off to exclude it from the export.</li><li>Hover a branch for + to add a child. Hover a node for add/delete controls. Delete all clears the tree; Undo restores it.</li><li>Arrow keys move a focused node or pan the canvas. Use 0 on the canvas to fit the tree.</li></ul><p className="help-note">Create a blank tree or import JSON, then select a tree on your Bonsai bench. Species guide the automatic branch shape; you can still train branches by dragging. Your bench saves automatically in this browser, including tree edits, species, and placement. Export JSON for a separate backup. Clearing browser data removes the bench. Undo history lasts for this session.</p><button className="primary-button" onClick={() => help.current.close()}>Done</button></dialog>
  </>;
}
