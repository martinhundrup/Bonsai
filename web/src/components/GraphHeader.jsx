import { useMemo, useRef } from 'react';
import { species, getSpecies } from '../species.js';
import { appearanceSummary } from '../appearance.js';
import { IconButton } from './Shared.jsx';

function AllNodesSlider({ property, label, min, max, summary, disabled, onChange }) {
  const gesture = useRef(null), percent = Math.round(summary.value * 100);
  const start = () => { gesture.current = { first: true }; }, finish = () => { gesture.current = null; };
  return <div className="trunk-control">
    <label htmlFor={`all-nodes-${property}`}>{label}<output aria-hidden="true">{summary.mixed ? 'Mixed' : `${percent}%`}</output></label>
    <input id={`all-nodes-${property}`} type="range" min={min} max={max} step="1" value={percent} disabled={disabled} aria-label={property === 'size' ? 'All nodes size' : 'All nodes roundness'} aria-valuetext={summary.mixed ? `Mixed; ${percent}% average. Adjust to set all nodes.` : `${percent}%`} aria-describedby="all-nodes-note"
      onPointerDown={start} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish}
      onKeyDown={event => { if (!event.repeat && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) start(); }} onKeyUp={finish}
      onChange={event => { const checkpoint = gesture.current?.first ?? true; if (gesture.current) gesture.current.first = false; onChange({ [property]: Number(event.target.value) / 100 }, checkpoint); }} />
  </div>;
}

export default function GraphHeader({ doc, trunk, onSpecies, onTrunkChange, onAllAppearance, onClear, onExpand, allExpanded, fullscreen }) {
  const appearance = useMemo(() => appearanceSummary(doc?.nodes), [doc?.nodes]);
  return <header className="graph-header">
    <div className="canvas-topbar">
      {doc && <div className="graph-growing-controls">
      {doc && <div className="species-bar">
        <label htmlFor="tree-species">Species<select id="tree-species" title={getSpecies(doc.species).styles} value={getSpecies(doc.species).id} onChange={event => onSpecies(event.target.value)}>
          {species.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select></label>
      </div>}
      <fieldset className="trunk-controls">
        <legend>Trunk</legend>
        <div className="trunk-control">
          <label htmlFor="base-thickness">Base thickness <output aria-hidden="true">{Math.round(trunk.baseThickness * 100)}%</output></label>
          <input id="base-thickness" type="range" min="25" max="200" step="5" value={Math.round(trunk.baseThickness * 100)} aria-valuetext={`${Math.round(trunk.baseThickness * 100)}% of species base`} aria-describedby="trunk-note" onChange={event => onTrunkChange({ baseThickness: Number(event.target.value) / 100 })} />
        </div>
        <div className="trunk-control">
          <label htmlFor="taper-amount">Taper amount <output aria-hidden="true">{trunk.taperAmount}%</output></label>
          <input id="taper-amount" type="range" min="0" max="100" step="1" value={trunk.taperAmount} aria-valuetext={`${trunk.taperAmount}% taper`} aria-describedby="trunk-note" onChange={event => onTrunkChange({ taperAmount: Number(event.target.value) })} />
        </div>
      </fieldset>
      <p id="trunk-note" className="graph-control-note">Sized by tree height. Saved for this tree.</p>
      </div>}
      {doc && <fieldset className="trunk-controls node-global-controls" key={doc.id}>
        <legend>All nodes</legend>
        <AllNodesSlider property="size" label="All node size" min={55} max={165} summary={appearance.size} disabled={!doc.nodes.length} onChange={onAllAppearance} />
        <AllNodesSlider property="rounding" label="All roundness" min={0} max={100} summary={appearance.rounding} disabled={!doc.nodes.length} onChange={onAllAppearance} />
        <p id="all-nodes-note" className="graph-control-note">Sets every node in this tree, including hidden branches. Size preserves roundness; roundness preserves size. Saved automatically.</p>
      </fieldset>}
      <div className="canvas-actions">
        {doc && <button className="text-button" disabled={!Object.keys(doc.trunkSettings ?? {}).length} onClick={() => onTrunkChange(null)}>Reset trunk</button>}
        <button className="text-button delete-all" disabled={!doc?.nodes.length} onClick={onClear}>Delete all</button>
        <button id="expand-button" className="text-button" disabled={!doc?.nodes.length} onClick={onExpand}>{allExpanded ? 'Collapse all' : 'Expand all'}</button>
        <IconButton ref={fullscreen.button} icon={fullscreen.active ? 'fullscreen-exit' : 'fullscreen'} label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen tree editor'} aria-pressed={fullscreen.active} disabled={!doc} onClick={fullscreen.toggle} />
      </div>
    </div>
  </header>;
}
