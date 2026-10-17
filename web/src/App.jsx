import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDocument, parseJson, isIncluded, toggleNode, restoreAll, undo, redo, prune, visibleNodes, exportName, sampleData, addNode, deleteNode, deleteAllNodes } from './core.js';
import TreeCanvas from './components/TreeCanvas.jsx';
import JsonPreview from './components/JsonPreview.jsx';
import { BrandMark, Icon, IconButton, NodeSwitch, ExpandButton, typeSymbols, typeLabel } from './components/Shared.jsx';

function initialWorkspace() {
  const doc = createDocument('collection.json', sampleData, { sample: true });
  return { documents: [doc], activeId: doc.id };
}

export default function App() {
  const [{ documents, activeId }, setWorkspace] = useState(initialWorkspace);
  const [view, setView] = useState('tree'), [query, setQuery] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [dropActive, setDropActive] = useState(false), [zoomPercent, setZoomPercent] = useState(100);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [draft, setDraft] = useState({ parentId: null, key: 'new_node', value: 'null' }), [draftError, setDraftError] = useState('');
  const nodeEditor = useRef(null);
  const fileInput = useRef(null), help = useRef(null), graphApi = useRef(null), importing = useRef(false), dragDepth = useRef(0);
  const doc = documents.find(item => item.id === activeId);
  const nodes = useMemo(() => doc ? visibleNodes(doc, query) : [], [doc?.id, doc?.nodes, doc?.collapsed, query]);
  const output = useMemo(() => doc && !doc.empty ? JSON.stringify(prune(doc), null, 2) : null, [doc?.id, doc?.nodes, doc?.excluded, doc?.empty]);
  const allExpanded = !!doc?.nodes.length && doc.nodes.filter(node => node.children.length).every(node => !doc.collapsed.has(node.id));

  const notify = useCallback(text => setMessage(text), []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3200); return () => clearTimeout(timer); }, [message]);
  const editDocument = useCallback(recipe => {
    setWorkspace(workspace => ({ ...workspace, documents: workspace.documents.map(item => {
      if (item.id !== workspace.activeId) return item;
      const next = { ...item, excluded: new Set(item.excluded), history: [...item.history], future: [...item.future] };
      recipe(next); return next;
    }) }));
  }, []);
  const onToggle = useCallback(id => editDocument(item => toggleNode(item, id)), [editDocument]);
  const onCollapse = useCallback(id => editDocument(item => {
    item.collapsed = new Set(item.collapsed);
    if (item.collapsed.has(id)) item.collapsed.delete(id); else item.collapsed.add(id);
  }), [editDocument]);
  const onSelect = useCallback(id => editDocument(item => { item.selected = id; }), [editDocument]);
  function structuralEdit(recipe) {
    const next = { ...doc, excluded: new Set(doc.excluded), collapsed: new Set(doc.collapsed), history: [...doc.history], future: [...doc.future] };
    recipe(next);
    setWorkspace(current => ({ ...current, documents: current.documents.map(item => item.id === next.id ? next : item) }));
  }
  function onAdd(parentId) {
    const parent = doc?.byId.get(parentId);
    let key = 'new_node', index = 2;
    while (parent?.type === 'object' && Object.hasOwn(parent.value, key)) key = `new_node_${index++}`;
    setDraft({ parentId, key, value: doc?.empty ? '{}' : 'null' }); setDraftError('');
    nodeEditor.current.showModal();
  }
  function submitNode(event) {
    event.preventDefault();
    try { const value = parseJson(draft.value); structuralEdit(item => addNode(item, draft.parentId, draft.key, value)); setQuery(''); nodeEditor.current.close(); }
    catch (error) { setDraftError(error.message); }
  }
  function onDelete(id) { structuralEdit(item => deleteNode(item, id)); }

  function selectFile(id) { setWorkspace(current => ({ ...current, activeId: id })); setQuery(''); }
  function closeFile(id) {
    const closing = documents.find(item => item.id === id);
    setWorkspace(current => {
      const index = current.documents.findIndex(item => item.id === id), remaining = current.documents.filter(item => item.id !== id);
      return { documents: remaining, activeId: current.activeId === id ? remaining[Math.min(index, remaining.length - 1)]?.id : current.activeId };
    });
    if (id === activeId) setQuery('');
    notify(`Closed ${closing.name}`);
  }
  function openSample() {
    setWorkspace(current => {
      const existing = current.documents.find(item => item.sample);
      const sample = existing ?? createDocument('collection.json', sampleData, { sample: true });
      return { documents: existing ? current.documents : [...current.documents, sample], activeId: sample.id };
    }); setQuery('');
  }
  const importFiles = useCallback(async files => {
    if (importing.current) { notify('Finishing your previous import. Please try again in a moment.'); return; }
    importing.current = true;
    const errors = [], loaded = [];
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { errors.push(`${file.name}: This file is larger than the 10 MB limit.`); continue; }
        try { loaded.push(createDocument(file.name, parseJson(await file.text()))); }
        catch (err) { errors.push(`${file.name}: ${err.message}`); }
      }
      if (loaded.length) {
        setWorkspace(current => ({ documents: [...current.documents, ...loaded], activeId: loaded[0].id })); setQuery('');
      }
      setError(errors.length ? `Couldn't import ${errors.length === 1 ? 'a file' : 'some files'}:\n${errors.join('\n')}` : '');
    } finally { importing.current = false; if (fileInput.current) fileInput.current.value = ''; }
  }, [notify]);

  const download = useCallback(() => {
    if (!doc || output === null) return;
    const url = URL.createObjectURL(new Blob([output + '\n'], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = exportName(doc.name); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notify(`Saved ${exportName(doc.name)}`);
  }, [doc?.id, doc?.name, output, notify]);
  async function copy() {
    if (output === null) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(output);
      else {
        const textarea = document.createElement('textarea'); textarea.value = output; textarea.style.cssText = 'position:fixed;opacity:0'; document.body.append(textarea); textarea.select();
        const success = document.execCommand('copy'); textarea.remove(); if (!success) throw new Error('Copy unavailable');
      }
      notify('Pruned JSON copied to clipboard.');
    } catch { setError('Your browser could not access the clipboard. Use Export JSON to save a copy.'); }
  }

  useEffect(() => {
    function keyboard(event) {
      if (help.current?.open || nodeEditor.current?.open) return;
      if (event.target.matches('input, textarea, [contenteditable="true"]')) return;
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
      <aside className="sidebar"><button className="import-button" onClick={() => fileInput.current.click()}><Icon name="plus" /> Import JSON</button><input id="file-input" ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={event => importFiles([...event.target.files])} />
        <div id="file-list" className="file-list" aria-label="Loaded JSON files">{documents.map(item => <div className={`file-item ${item.id === activeId ? 'active' : ''}`} key={item.id}><button className="file-select" aria-label={item.name} aria-current={item.id === activeId ? 'true' : 'false'} title={item.name} onClick={() => selectFile(item.id)}><Icon name="file" /><span className="file-name">{item.name}</span></button><IconButton icon="close" label={`Close ${item.name}`} className="icon-button file-remove" onClick={() => closeFile(item.id)} /></div>)}</div>
        <button className="sample-button" onClick={openSample}>Open example</button>
      </aside>
      <main className="main-content"><section className="document-header"><h1 id="document-title">{doc?.name ?? 'Import JSON to begin'}</h1><button className="primary-button export-button" disabled={!doc || doc.empty} onClick={download}><Icon name="download" /> Export JSON</button></section>
        <div id="notice" className="notice" role="alert" hidden={!error}>{error}<IconButton icon="close" label="Dismiss error" onClick={() => setError('')} /></div>
        <div className="workspace-toolbar"><div className="view-tabs" role="tablist" aria-label="JSON layout" onKeyDown={tabKey}>{['tree', 'list'].map(tab => <button key={tab} id={`${tab}-tab`} role="tab" aria-selected={view === tab} aria-controls={`${tab}-view`} tabIndex={view === tab ? 0 : -1} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}><Icon name={tab} />{tab === 'tree' ? 'Tree view' : 'List view'}</button>)}</div><div className="toolbar-right"><label className="search-box"><Icon name="search" /><input id="search" type="search" placeholder="Search" aria-label="Search JSON keys and values" value={query} disabled={!doc} onChange={event => setQuery(event.target.value)} /></label><span className="toolbar-separator" /><IconButton id="undo-button" icon="undo" label="Undo" disabled={!doc?.history.length} onClick={() => editDocument(undo)} /><IconButton id="redo-button" icon="undo" label="Redo" className="icon-button redo" disabled={!doc?.future.length} onClick={() => editDocument(redo)} /><button id="restore-button" className="text-button" disabled={!doc?.excluded.size} onClick={() => editDocument(restoreAll)}>Restore all</button></div></div>
        <div className={`editor-grid${previewCollapsed ? ' preview-collapsed' : ''}`}><section className="visual-panel" aria-label="JSON explorer"><div className="canvas-topbar"><button className="text-button delete-all" disabled={!doc?.nodes.length} onClick={() => structuralEdit(deleteAllNodes)}>Delete all</button><button id="expand-button" className="text-button" disabled={!doc?.nodes.length} onClick={expandAll}>{allExpanded ? 'Collapse all' : 'Expand all'}</button></div>
          <TreeCanvas doc={doc} nodes={nodes} hidden={!doc || view !== 'tree'} query={query} graphApi={graphApi} onZoom={setZoomPercent} onSelect={onSelect} onToggle={onToggle} onCollapse={onCollapse} onAdd={onAdd} onDelete={onDelete} />
          <div id="list-view" role="tabpanel" aria-labelledby="list-tab" className="list-view" hidden={!!doc && view !== 'list'}>{doc ? <><div className="list-column-labels"><span>BRANCH / VALUE</span><span>KEEP</span></div><div id="list-content">{nodes.map(node => <div key={node.id} className={`list-row ${isIncluded(doc, node) ? '' : 'off'} ${doc.selected === node.id ? 'selected' : ''}`} style={{ '--depth': Math.min(node.depth, 14) }} tabIndex={0} role="group" aria-label={`${node.key}, ${node.type}`} onClick={() => onSelect(node.id)} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect(node.id); } }}><ExpandButton doc={doc} node={node} onCollapse={onCollapse} /><span className={`type-icon ${node.type}`}>{typeSymbols[node.type]}</span><span className="list-key" title={node.key}>{node.parent === null ? '$ root' : node.key}</span><span className="list-value" title={typeLabel(node)}>{typeLabel(node)}</span><NodeSwitch doc={doc} node={node} onToggle={onToggle} />{["object","array"].includes(node.type) && <IconButton icon="plus" label={`Add node to ${node.key}`} onClick={event => { event.stopPropagation(); onAdd(node.id); }} />}<IconButton icon="close" label={`Delete ${node.key}`} onClick={event => { event.stopPropagation(); onDelete(node.id); }} /></div>)}{doc.empty && <button className="primary-button empty-root-button" onClick={() => onAdd(null)}>Add root node</button>}{noMatches && <p className="empty-preview">No matching branches.</p>}</div></> : <div id="list-content" className="empty-workspace"><button className="primary-button" onClick={() => fileInput.current.click()}><Icon name="plus" /> Import JSON</button><button className="text-button" onClick={openSample}>Open example</button></div>}</div>
          <div id="graph-controls" className="graph-controls" hidden={view !== 'tree' || !doc}><IconButton icon="minus" label="Zoom out" onClick={() => graphApi.current.zoom(1 / 1.2)} /><span id="zoom-label">{zoomPercent}%</span><IconButton icon="plus" label="Zoom in" onClick={() => graphApi.current.zoom(1.2)} /><span className="control-divider" /><IconButton icon="fit" label="Fit tree to view" onClick={() => graphApi.current.fit()} /></div>
        </section><JsonPreview output={output} onCopy={copy} collapsed={previewCollapsed} onToggle={() => setPreviewCollapsed(value => !value)} /></div>
      </main>
    </div>
    <div id="drop-overlay" className="drop-overlay" hidden={!dropActive}><div><Icon name="upload" /><h2>Drop JSON files</h2></div></div><div id="toast" className="toast" role="status" hidden={!message}>{message}</div>
    <dialog ref={nodeEditor} className="node-editor"><form onSubmit={submitNode}><h2>{doc?.empty ? 'Add root node' : 'Add node'}</h2>{!doc?.empty && doc?.byId.get(draft.parentId)?.type === 'object' && <label>Key<input autoFocus value={draft.key} onChange={event => setDraft({ ...draft, key: event.target.value })} /></label>}<label>JSON value<textarea aria-label="JSON value" rows={5} value={draft.value} onChange={event => setDraft({ ...draft, value: event.target.value })} spellCheck={false} /></label>{draftError && <p className="editor-error" role="alert">{draftError}</p>}<div className="dialog-actions"><button type="button" className="text-button" onClick={() => nodeEditor.current.close()}>Cancel</button><button type="submit" className="primary-button">Add node</button></div></form></dialog>
    <dialog id="help-dialog" ref={help} onClick={event => { if (event.target !== event.currentTarget) return; const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) help.current.close(); }}><IconButton icon="close" label="Close help" className="icon-button dialog-close" onClick={() => help.current.close()} /><h2>Controls</h2><ul><li>Drag a node with its children, or drag the pot independently. Drag the background to pan. Scroll or pinch to zoom.</li><li>Use + and − to expand or collapse branches. Switch a branch off to exclude it from the export.</li><li>Hover a branch for + to add a child. Hover a node for add/delete controls. Delete all clears the tree; Undo restores it.</li><li>Arrow keys move a focused node or pan the canvas. Use 0 on the canvas to fit the tree.</li></ul><p className="help-note">Files stay in your browser for this session. Export to save your changes.</p><button className="primary-button" onClick={() => help.current.close()}>Done</button></dialog>
  </>;
}
