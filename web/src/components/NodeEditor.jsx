import { useEffect, useRef } from 'react';

export default function NodeEditor({ doc, draft, error, dialogRef, onDraft, onSubmit }) {
  const keyInput = useRef(null), valueInput = useRef(null);
  const editing = draft.mode === 'edit', node = doc?.byId.get(draft.nodeId), parent = doc?.byId.get(draft.parentId);
  const root = editing && node?.parent === null;
  const showKey = editing ? root || parent?.type === 'object' : !doc?.empty && ['object', 'null'].includes(parent?.type);
  const title = editing ? 'Edit node' : doc?.empty ? 'Add root node' : 'Add node';
  useEffect(() => {
    if (dialogRef.current?.open) (showKey ? keyInput : valueInput).current?.focus();
  }, [draft.mode, draft.nodeId, draft.parentId, showKey, dialogRef]);
  return <dialog ref={dialogRef} className="node-editor" aria-labelledby="node-editor-title">
    <form onSubmit={onSubmit}>
      <h2 id="node-editor-title">{title}</h2>
      {showKey && <label>{root ? 'Tree name' : 'Key'}<input ref={keyInput} autoFocus value={draft.key} onChange={event => onDraft({ ...draft, key: event.target.value })} /></label>}
      {editing && parent?.type === 'array' && <p>Array item {node.key}. Its index follows its position in the array.</p>}
      {!editing && parent?.type === 'null' && <p>Adding a child turns this null into an object.</p>}
      <label>JSON value<textarea ref={valueInput} autoFocus={!showKey} aria-label="JSON value" rows={8} value={draft.value} onChange={event => onDraft({ ...draft, value: event.target.value })} spellCheck={false} /></label>
      {error && <p className="editor-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={() => dialogRef.current.close()}>Cancel</button>
        <button type="submit" className="primary-button">{editing ? 'Save changes' : 'Add node'}</button>
      </div>
    </form>
  </dialog>;
}
