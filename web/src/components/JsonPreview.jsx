import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from './Shared.jsx';
import { jsonDiagnostic } from '../jsonSyntax.js';

function colorLine(line, errorColumn = -1) {
  const parts = []; let end = 0;
  function segment(value, start, kind = '') {
    const index = errorColumn - start;
    const content = index >= 0 && index < value.length ? <>{value.slice(0, index)}<span className="json-error-token">{value[index]}</span>{value.slice(index + 1)}</> : value;
    return <span key={start} className={kind}>{content}</span>;
  }
  const tokens = /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const match of line.matchAll(tokens)) {
    if (match.index > end) parts.push(segment(line.slice(end, match.index), end));
    const token = match[0];
    const kind = token.startsWith('"') ? token.trimEnd().endsWith(':') ? 'key' : 'string' : token === 'null' ? 'null' : /true|false/.test(token) ? 'boolean' : 'number';
    parts.push(segment(token, match.index, `json-${kind}`)); end = match.index + token.length;
  }
  if (end < line.length) parts.push(segment(line.slice(end), end));
  if (errorColumn === line.length) parts.push(<span key="error-end" className="json-error-token json-error-eol">{'\u00a0'}</span>);
  return parts;
}

export default function JsonPreview({ docId, source, output, onApply, onCopy, collapsed, onToggle }) {
  const [mode, setMode] = useState('source'), [drafts, setDrafts] = useState(new Map()), [failure, setFailure] = useState(null);
  const gutter = useRef(null), highlight = useRef(null), input = useRef(null);
  const entry = drafts.get(docId), text = entry?.text ?? source ?? '', dirty = !!entry && text !== (source ?? '');
  const diagnostic = useMemo(() => dirty ? jsonDiagnostic(text) : null, [text, dirty]);
  const error = diagnostic ? `Line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}` : (failure?.id === docId ? failure.message : '');
  const sourceLines = useMemo(() => text.split('\n'), [text]);
  const coloredSource = useMemo(() => sourceLines.map((line, index) => <div key={index} className={`json-source-line${diagnostic?.line === index + 1 ? ' json-error-line' : ''}`}>{colorLine(line, diagnostic?.line === index + 1 ? diagnostic.column - 1 : -1)}{'\n'}</div>), [sourceLines, diagnostic]);
  const lines = useMemo(() => mode === 'export' && output !== null ? output.split('\n').map((line, index) => <div className="code-line" key={index}><span className="line-number" aria-hidden="true">{index + 1}</span><code>{colorLine(line)}</code></div>) : null, [output, mode]);
  function change(value) {
    setFailure(null);
    setDrafts(previous => {
      const next = new Map(previous);
      if (value === (source ?? '')) next.delete(docId);
      else next.set(docId, { text: value, base: entry?.base ?? source ?? '' });
      return next;
    });
  }
  function revert() { setDrafts(previous => { const next = new Map(previous); next.delete(docId); return next; }); setFailure(null); }
  function apply() {
    if (!docId || !dirty || diagnostic) return;
    try { onApply(text); revert(); }
    catch (error) { setFailure({ id: docId, message: error.message }); }
  }
  function tabKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 'source' : event.key === 'End' ? 'export' : mode === 'source' ? 'export' : 'source';
    setMode(next); document.getElementById(`json-${next}-tab`).focus();
  }
  function syncScroll() {
    if (!input.current) return;
    if (gutter.current) gutter.current.scrollTop = input.current.scrollTop;
    if (highlight.current) { highlight.current.scrollTop = input.current.scrollTop; highlight.current.scrollLeft = input.current.scrollLeft; }
  }
  useLayoutEffect(syncScroll, [text, docId, mode, collapsed]);
  function goToError() {
    if (!diagnostic || !input.current) return;
    const editor = input.current, style = getComputedStyle(editor), lineHeight = parseFloat(style.lineHeight);
    editor.focus(); editor.setSelectionRange(diagnostic.position, Math.min(text.length, diagnostic.position + 1));
    editor.scrollTop = (diagnostic.line - 1) * lineHeight - editor.clientHeight / 2 + lineHeight;
    editor.scrollLeft = Math.max(0, (diagnostic.column - 1) * parseFloat(style.fontSize) * .6 - editor.clientWidth / 2);
    syncScroll();
  }
  return <section className={`preview-panel${collapsed ? ' collapsed' : ''}`} aria-label="JSON editor and export preview">
    <div className="preview-header">
      <span className="preview-title">JSON</span>
      <div className="json-mode-tabs" role="tablist" aria-label="JSON pane" hidden={collapsed} onKeyDown={tabKey}>
        {['source', 'export'].map(tab => <button key={tab} id={`json-${tab}-tab`} role="tab" aria-selected={mode === tab} aria-controls={`json-${tab}-panel`} tabIndex={mode === tab ? 0 : -1} onClick={() => setMode(tab)}>{tab === 'source' ? 'Edit' : 'Export'}</button>)}
      </div>
      <div className="preview-actions">
        <IconButton id="copy-button" icon="copy" label={mode === 'source' ? 'Copy JSON source' : 'Copy pruned JSON'} onClick={() => onCopy(mode === 'source' ? text : output, mode === 'source' ? 'JSON source' : 'Pruned JSON')} disabled={mode === 'source' ? !docId : output === null} hidden={collapsed} />
        <IconButton className="icon-button preview-toggle" icon="chevron" label={`${collapsed ? 'Expand' : 'Collapse'} JSON preview`} aria-expanded={!collapsed} aria-controls="json-preview" onClick={onToggle} />
      </div>
    </div>
    <div id="json-preview" className="json-pane-content" hidden={collapsed}>
      <div id="json-source-panel" className="json-source-panel" role="tabpanel" aria-labelledby="json-source-tab" hidden={mode !== 'source'}>
        <div className="json-source-editor">
          <pre ref={gutter} className="json-source-lines" aria-hidden="true">{sourceLines.map((_, index) => <div key={index} className={diagnostic?.line === index + 1 ? 'json-error-gutter' : ''}>{index + 1}</div>)}</pre>
          <div className="json-source-code">
            <pre ref={highlight} className="json-source-highlight" aria-hidden="true">{coloredSource}</pre>
            <textarea ref={input} className="json-source-input" aria-label="JSON source" aria-describedby="json-source-status" aria-invalid={!!error} aria-errormessage={error ? 'json-source-status' : undefined} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={!docId} value={text} placeholder={docId ? 'Enter JSON to grow this tree.' : 'Select a tree to edit its JSON.'} onChange={event => change(event.target.value)} onScroll={syncScroll} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); apply(); } }} />
          </div>
        </div>
        <div className="json-source-footer">
          <p id="json-source-status" className={`json-source-status${error ? ' editor-error' : ''}`} role={error ? 'alert' : 'status'}>{diagnostic ? <button className="json-error-jump" onClick={goToError} title="Go to syntax error">{error}</button> : error || (dirty ? entry.base !== (source ?? '') ? 'Tree changed. Apply replaces it with this draft.' : 'Unapplied changes' : 'Full tree · edit, then Apply')}</p>
          <div className="json-source-actions"><button className="text-button" disabled={!dirty} onClick={revert}>Revert</button><button className="primary-button" disabled={!docId || !dirty || !!diagnostic} title="Apply JSON changes (Ctrl+Enter)" onClick={apply}>Apply</button></div>
        </div>
      </div>
      <div id="json-export-panel" className="json-preview" role="tabpanel" aria-labelledby="json-export-tab" hidden={mode !== 'export'} tabIndex={0} aria-label="Pruned JSON source">{lines ?? <p className="empty-preview">No JSON nodes.</p>}</div>
    </div>
  </section>;
}
