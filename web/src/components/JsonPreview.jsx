import { useMemo } from 'react';
import { IconButton } from './Shared.jsx';

function colorLine(line) {
  const parts = []; let end = 0;
  const tokens = /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const match of line.matchAll(tokens)) {
    parts.push(line.slice(end, match.index));
    const token = match[0];
    const kind = token.startsWith('"') ? token.trimEnd().endsWith(':') ? 'key' : 'string' : token === 'null' ? 'null' : /true|false/.test(token) ? 'boolean' : 'number';
    parts.push(<span key={match.index} className={`json-${kind}`}>{token}</span>); end = match.index + token.length;
  }
  parts.push(line.slice(end)); return parts;
}

export default function JsonPreview({ output, onCopy, collapsed, onToggle }) {
  const lines = useMemo(() => output?.split('\n').map((line, index) => <div className="code-line" key={index}><span className="line-number" aria-hidden="true">{index + 1}</span><code>{colorLine(line)}</code></div>), [output]);
  return <section className={`preview-panel${collapsed ? ' collapsed' : ''}`} aria-label="Pruned JSON preview"><div className="preview-header"><span className="preview-title">JSON preview</span><div className="preview-actions"><IconButton id="copy-button" icon="copy" label="Copy pruned JSON" onClick={onCopy} disabled={output === null} hidden={collapsed} /><IconButton className="icon-button preview-toggle" icon="chevron" label={`${collapsed ? 'Expand' : 'Collapse'} JSON preview`} aria-expanded={!collapsed} aria-controls="json-preview" onClick={onToggle} /></div></div><div id="json-preview" className="json-preview" hidden={collapsed} tabIndex={0} aria-label="Pruned JSON source">{lines ?? <p className="empty-preview">No JSON nodes.</p>}</div></section>;
}
