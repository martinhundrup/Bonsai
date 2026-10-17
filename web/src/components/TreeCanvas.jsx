import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isIncluded, canAddChild } from '../core.js';
import { branchLayout, branchPaths, graphBounds, nodeMetrics, NODE_WIDTH, NODE_HEIGHT, POT_ID, POT_NODE } from '../graph.js';
import { cameraViewBox, fitCamera, zoomCamera, MAX_ZOOM } from '../camera.js';
import { getSpecies } from '../species.js';
import { CollisionWorld } from '../collisions.js';
import { ElasticDrag } from '../elastic.js';
import { growthPreferences } from '../growth.js';
import { trunkProfile, trunkSettings } from '../trunk.js';
import { nodeAppearance } from '../appearance.js';
import { typeLabel, typeSymbols } from './Shared.jsx';
import PotControls from './PotControls.jsx';
import PotArtwork from './PotArtwork.jsx';
import { potSettings, POT_TRUNK_Y } from '../pot.js';
import { nodeDetailLevel } from '../detail.js';

const initialCamera = { x: 0, y: 0, scale: 1 };
const POT_BACK_ID = `${POT_ID}:back`;
const shorten = (value, max) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
function activate(event, callback) {
  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault(); event.stopPropagation(); callback();
}

function paintEdge(edge, paths, opacity) {
  const values = [[edge.children[0], 'd', paths.body], [edge.children[1], 'd', paths.grain], [edge.children[2], 'd', paths.grain], [edge, 'opacity', String(opacity)]];
  if (edge.children[3]) values.push([edge.children[3], 'transform', `translate(${paths.midpoint.x} ${paths.midpoint.y})`]);
  for (const [element, attribute, value] of values) if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
}

function AddControl({ label, onClick, className = 'svg-edge-add' }) {
  return <g className={className} role="button" tabIndex={0} aria-label={label} onClick={event => activate(event, onClick)} onKeyDown={event => activate(event, onClick)}>
    <title>{label}</title><circle className="svg-add-disc" r="13" /><path className="svg-control-line" d="M-5 0H5M0-5V5" />
  </g>;
}

function Edge({ id, parent, off, register, onAdd, detail = 'full' }) {
  return <g ref={element => register(id, element)} data-edge-id={id} data-detail={detail} className={`tree-edge ${off ? 'off' : ''}`}>
    <path className="tree-edge-body" /><path className="tree-edge-grain" /><path className="tree-edge-hit" />
    {canAddChild(parent) && <AddControl label={`Add node to ${parent.key}`} onClick={() => onAdd(parent.id)} />}
  </g>;
}

function NodeShapeHandle({ label, value, min, max, x, y, kind, disabled, onChange }) {
  const drag = useRef(null);
  function update(event) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(state.inverse);
    const distance = (point.x - state.x + point.y - state.y) / 2;
    const change = kind === 'size' ? distance * 100 / (NODE_WIDTH / 2) : -distance * 100 / 60;
    const next = Math.round(Math.max(min, Math.min(max, state.value + change)));
    if (next === state.last) return;
    onChange(next, state.first); state.first = false;
    state.last = next;
  }
  function finish(event) {
    event.stopPropagation();
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }
  return <g className={`node-shape-handle node-${kind}-handle`} role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value}%`} aria-description={kind === 'size' ? 'Drag the outer dot outward to grow or inward to shrink.' : 'Drag the inner dot inward to round the corners or outward to square them.'}
    onClick={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.button !== 0 || disabled) return;
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      const inverse = event.currentTarget.getScreenCTM().inverse();
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
      drag.current = { pointerId: event.pointerId, inverse, x: point.x, y: point.y, value, last: value, first: true };
    }} onPointerMove={event => { event.stopPropagation(); update(event); }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event => {
      const delta = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 10, PageDown: -10 }[event.key];
      if (delta === undefined && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      onChange(event.key === 'Home' ? min : event.key === 'End' ? max : Math.max(min, Math.min(max, value + delta)), true);
    }}>
    <title>{label}: {value}%. {kind === 'size' ? 'Drag outward to grow; inward to shrink.' : 'Drag inward to round; outward to square.'}</title>
    <circle className="node-handle-hit" cx={x} cy={y} r="12" />
    <circle className="node-handle-ring" cx={x} cy={y} r="5" />
    <circle className="node-handle-dot" cx={x} cy={y} r={kind === 'size' ? 2.2 : 1.5} />
  </g>;
}

const SvgNode = memo(function SvgNode({ node, included, ownIncluded, collapsed, selected, exiting, register, onSelect, onToggle, onCollapse, onDrag, onAdd, onDelete, onAppearance, zoom, onZoomToNode, onEdit }) {
  const x = -NODE_WIDTH / 2;
  const appearance = nodeAppearance(node.appearance), metrics = nodeMetrics(node);
  const contentY = (metrics.localHeight - NODE_HEIGHT) / 2;
  const cornerInset = metrics.radius * (1 - Math.SQRT1_2);
  const corner = { x: NODE_WIDTH / 2 - cornerInset + 3, y: metrics.localHeight - cornerInset + 3 };
  const detail = nodeDetailLevel(node, zoom), screenScale = metrics.scale * zoom;
  const labelLength = Math.max(3, Math.min(28, Math.floor(metrics.width * zoom / 6.6) - 2));
  return <g ref={element => register(node.id, element)} data-node-id={node.id} data-detail={detail} className={`graph-node svg-node ${node.parent === null ? 'root' : ''} ${included ? '' : 'off'} ${selected ? 'selected' : ''}`} tabIndex={exiting ? -1 : 0} role="group" aria-hidden={exiting || undefined} aria-label={`${node.key}, ${node.type}, ${included ? 'included' : 'pruned'}`} aria-description="Double-click or press Enter to edit this node." style={{ pointerEvents: exiting ? 'none' : undefined }} onPointerDown={event => onDrag(event, node.id)} onClick={event => { event.stopPropagation(); onSelect(node.id); }} onDoubleClick={event => {
    if (event.target.closest('.svg-expand,.svg-switch,.svg-node-actions,.node-shape-handle')) return;
    event.preventDefault(); event.stopPropagation();
    if (detail !== 'full') onZoomToNode(node.id);
    onEdit(node.id);
  }} onKeyDown={event => { if (event.target === event.currentTarget) activate(event, () => { onSelect(node.id); if (detail !== 'full') onZoomToNode(node.id); if (event.key === 'Enter') onEdit(node.id); }); }}>
    <title>{`${node.key}: ${typeLabel(node)}\nDouble-click or press Enter to edit.`}</title>
    <rect className="svg-card" x={x} width={NODE_WIDTH} height={metrics.localHeight} rx={metrics.radius} />
    <text className="node-compact-label" x="0" y={metrics.localHeight / 2} textAnchor="middle" dominantBaseline="central" fontSize={11 / screenScale} aria-hidden="true">{shorten(node.parent === null ? '$ root' : node.key, labelLength)}</text>
    <g className="svg-node-content" transform={`translate(0 ${contentY})`}>
    <rect className={`svg-type-box ${node.type}`} x={x + 12} y="14" width="27" height="27" rx="6" />
    <text className={`svg-type-text ${node.type}`} x={x + 25.5} y="32" textAnchor="middle">{typeSymbols[node.type]}</text>
    <text className="svg-node-title" x={x + 48} y="32">{shorten(node.parent === null ? '$ root' : node.key, node.children.length ? 13 : 16)}</text>
    <text className="svg-node-value" x={x + 14} y="65">{shorten(typeLabel(node), node.parent === null ? 18 : 12)}</text>
    {!!node.children.length && <g className="svg-expand" role="button" tabIndex={exiting ? -1 : 0} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.key}`} aria-expanded={!collapsed} onClick={event => activate(event, () => onCollapse(node.id))} onKeyDown={event => activate(event, () => onCollapse(node.id))}>
      <title>{collapsed ? 'Expand branch' : 'Collapse branch'}</title><rect className="svg-hit-area" x={x + 176} y="4" width="38" height="40" rx="4" />
      <rect x={x + 185} y="15" width="20" height="20" rx="4" className="svg-expand-box" /><path d={`M${x + 190},25h10${collapsed ? `M${x + 195},20v10` : ''}`} className="svg-control-line" />
    </g>}
    {node.parent !== null && <g transform="translate(-58 0)" className={`svg-switch ${ownIncluded ? 'on' : ''} ${!included && ownIncluded ? 'inherited-off' : ''}`} role="switch" tabIndex={exiting ? -1 : 0} aria-checked={ownIncluded} aria-label={`Include ${node.key} in export`} onClick={event => activate(event, () => onToggle(node.id))} onKeyDown={event => activate(event, () => onToggle(node.id))}>
      <title>{`${!included && ownIncluded ? 'Parent branch is pruned. ' : ''}${ownIncluded ? 'Prune' : 'Restore'} this branch`}</title>
      <rect className="svg-hit-area" x={x + 174} y="43" width="40" height="37" rx="4" /><rect className="svg-switch-track" x={x + 177} y="54" width="28" height="16" rx="8" /><circle className="svg-switch-knob" cx={x + (ownIncluded ? 197 : 185)} cy="62" r="5" />
    </g>}
    </g>
    <NodeShapeHandle label={`Size of ${node.key}`} value={Math.round(appearance.size * 100)} min={55} max={165} x={corner.x + 10} y={corner.y + 10} kind="size" disabled={exiting} onChange={(value, checkpoint) => onAppearance(node.id, { size: value / 100 }, checkpoint)} />
    <NodeShapeHandle label={`Rounding of ${node.key}`} value={Math.round(appearance.rounding * 100)} min={0} max={100} x={corner.x - 23} y={corner.y - 23} kind="rounding" disabled={exiting} onChange={(value, checkpoint) => onAppearance(node.id, { rounding: value / 100 }, checkpoint)} />
    <g className="svg-node-actions" transform="translate(44 -19)">
      <rect x="-15" y="-15" width="64" height="35" fill="transparent" />
      {canAddChild(node) && <AddControl className="svg-node-add" label={`Add node to ${node.key}`} onClick={() => onAdd(node.id)} />}
      <g transform="translate(34 0)" className="svg-node-delete" role="button" tabIndex={exiting ? -1 : 0} aria-label={`Delete ${node.key}`} onClick={event => activate(event, () => onDelete(node.id))} onKeyDown={event => activate(event, () => onDelete(node.id))}><title>Delete node and its children</title><circle className="svg-add-disc" r="13" /><path className="svg-delete-line" d="M-5-4H5M-3-4V5H3V-4M-2-7H2" /></g>
    </g>
  </g>;
});

// Animate SVG geometry directly, keeping the keyed cards mounted and React out
// of the animation loop. Stationary cards retain their positions and markup.
function useBranches(doc, nodes, onDirty) {
  const documents = useRef(new Map()), scene = useRef(new Map()), elements = useRef(new Map()), edges = useRef(new Map());
  const documentId = useRef(null), frame = useRef(0), reduced = useRef(false);
  const layoutInputs = useRef(null);
  const elastic = useRef(null);
  const liveDoc = useRef(doc); liveDoc.current = doc;
  const [entries, setEntries] = useState([]);
  const trunkRef = useRef(null); trunkRef.current = getSpecies(doc?.species).trunk;
  const anatomy = useMemo(() => ({ nodes: doc?.nodes ?? [], growth: growthPreferences(doc?.nodes ?? [], doc?.species), settings: trunkSettings(doc) }), [doc?.nodes, doc?.species, doc?.trunkSettings]);
  const anatomyRef = useRef(anatomy); anatomyRef.current = anatomy;
  const liveNodes = useRef(nodes); liveNodes.current = nodes;
  const savePlacement = useCallback(() => {
    const arrangement = documents.current.get(documentId.current);
    if (!arrangement) return;
    for (const [id, item] of scene.current) {
      if (item.pending || item.exiting) continue;
      if (id === POT_ID) arrangement.pot = { ...item };
      else arrangement.positions.set(id, { x: item.x, y: item.y });
    }
    if (arrangement.positions.has('[]')) arrangement.lastRoot = arrangement.positions.get('[]');
    if (liveDoc.current?.id === documentId.current) liveDoc.current.arrangement = arrangement;
  }, []);
  const paint = useCallback(() => {
    const potPoint = scene.current.get(POT_ID) ?? { x: 0, y: 116 };
    const profile = trunkProfile(anatomyRef.current.nodes, scene.current, potPoint, trunkRef.current, anatomyRef.current.settings, anatomyRef.current.growth);
    for (const [id, item] of scene.current) {
      const element = elements.current.get(id);
      if (element) {
        const metrics = nodeMetrics(item.node);
        const transform = `translate(${item.x} ${item.y}) rotate(${item.angle ?? 0} 0 ${metrics.height / 2}) scale(${metrics.scale})`;
        if (element.getAttribute('transform') !== transform) element.setAttribute('transform', transform);
        if (element.getAttribute('opacity') !== String(item.opacity)) element.setAttribute('opacity', item.opacity);
        if (element.dataset.moving !== String(!!item.motion)) element.dataset.moving = String(!!item.motion);
        if (id === POT_ID) {
          const back = elements.current.get(POT_BACK_ID);
          if (back && back.getAttribute('transform') !== transform) back.setAttribute('transform', transform);
          if (back && back.getAttribute('opacity') !== String(item.opacity)) back.setAttribute('opacity', item.opacity);
        }
      }
      const edge = edges.current.get(id), parent = scene.current.get(item.node.parent);
      if (edge && parent) {
        const a = (parent.angle ?? 0) * Math.PI / 180, b = (item.angle ?? 0) * Math.PI / 180;
        const parentMetrics = nodeMetrics(parent.node), childMetrics = nodeMetrics(item.node);
        const parentHalf = parentMetrics.height / 2, childHalf = childMetrics.height / 2;
        const widths = profile.edge(item.node);
        const parentInset = Math.min(parentHalf, Math.max(14 * parentMetrics.scale, widths.baseRadius + 4));
        const childInset = Math.min(childHalf, Math.max(14 * childMetrics.scale, widths.tipRadius + 4));
        // Run wood behind the foliage instead of capping it at the tangent of
        // a rounded card, which exposes a clipped seam beside thick trunks.
        const x1 = parent.x + Math.sin(a) * (parentHalf - parentInset), y1 = parent.y + parentHalf - Math.cos(a) * (parentHalf - parentInset);
        const x2 = item.x - Math.sin(b) * (childHalf - childInset), y2 = item.y + childHalf + Math.cos(b) * (childHalf - childInset);
        const paths = branchPaths({ x: x1, y: y1, angle: a }, { x: x2, y: y2, angle: b }, 1, 1, { ...trunkRef.current, ...widths });
        paintEdge(edge, paths, Math.min(item.opacity, parent.opacity));
      }
    }
    const root = scene.current.get('[]'), pot = scene.current.get(POT_ID), stem = edges.current.get(POT_ID);
    if (root && pot && stem) {
      const metrics = nodeMetrics(root.node), half = metrics.height / 2, angle = (root.angle ?? 0) * Math.PI / 180;
      const widths = profile.edge(root.node), inset = Math.min(half, Math.max(14 * metrics.scale, widths.tipRadius + 4));
      const paths = branchPaths({ x: pot.x, y: pot.y + POT_TRUNK_Y * nodeMetrics(pot.node).scale }, { x: root.x - Math.sin(angle) * (half - inset), y: root.y + half + Math.cos(angle) * (half - inset), angle }, 1, 1, { ...trunkRef.current, ...widths });
      paintEdge(stem, paths, root.opacity);
    }
  }, []);
  const tick = useCallback(function animate(now) {
    frame.current = 0;
    let active = false, removed = false;
    for (const [id, item] of scene.current) {
      if (!item.motion || item.pending) continue;
      const m = item.motion, t = reduced.current ? 1 : Math.min(1, Math.max(0, (now - m.start) / m.duration));
      const fade = 1 - (1 - t) ** 3;
      item.opacity = m.opacity + (m.toOpacity - m.opacity) * fade;
      item.angle = t === 1 ? 0 : Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI) * (1 - t) * 3;
      if (item.exiting && t === 1) { scene.current.delete(id); removed = true; }
    }
    if (elastic.current) {
      const simulation = elastic.current;
      const running = simulation.step((now - (simulation.last ?? now - 16)) / 1000);
      simulation.last = now;
      savePlacement();
      if (running) active = true;
      else { elastic.current = null; onDirty(); }
    }
    const world = new CollisionWorld([...scene.current.values()].filter(item => !item.pending && item.opacity > .001));
    for (const [id, item] of scene.current) {
      const m = item.motion;
      if (!m) continue;
      active = true;
      if (item.exiting || item.pending) continue;
      const dt = Math.min(1 / 30, Math.max(.001, (now - (m.last ?? now - 16)) / 1000));
      m.last = now;
      const dx = m.toX - item.x, dy = m.toY - item.y;
      m.vx = (m.vx ?? 0) + (dx * 200 - (m.vx ?? 0) * 27) * dt;
      m.vy = (m.vy ?? 0) + (dy * 200 - (m.vy ?? 0) * 27) * dt;
      const finish = reduced.current || now - m.start >= m.duration && Math.hypot(dx, dy) < .5;
      const requested = finish ? { x: dx, y: dy } : { x: m.vx * dt, y: m.vy * dt };
      const moved = world.move([id], requested);
      item.x += moved.x; item.y += moved.y;
      if (Math.abs(moved.x - requested.x) > .001) m.vx = 0;
      if (Math.abs(moved.y - requested.y) > .001) m.vy = 0;
      if (finish && Math.hypot(m.toX - item.x, m.toY - item.y) < .001) {
        item.motion = null; item.angle = 0;
      }
    }
    // Reveal leaves only once their destination is clear. Closing leaves fade
    // in place, leaving their space reserved until they disappear.
    for (const item of scene.current.values()) if (item.pending && world.canPlace(item)) {
      item.pending = false; item.motion.start = now; item.motion.last = now;
      world.add(item); active = true;
    }
    paint();
    if (removed) setEntries([...scene.current.values()]);
    if (active) frame.current = requestAnimationFrame(animate);
  }, [paint, savePlacement, onDirty]);
  const wake = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(tick); }, [tick]);
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduced.current = media.matches; wake(); };
    update(); media.addEventListener('change', update);
    return () => { media.removeEventListener('change', update); cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [wake]);
  useLayoutEffect(() => {
    const previous = layoutInputs.current;
    const potSize = potSettings(doc).size;
    const potResized = previous?.id === doc?.id && previous.potSize !== potSize;
    const previousNodes = new Map((previous?.id === doc?.id ? previous.nodes : []).map(node => [node.id, node]));
    const reshaped = nodes.filter(node => {
      const old = previousNodes.get(node.id);
      return old && (nodeMetrics(old).width !== nodeMetrics(node).width || nodeMetrics(old).height !== nodeMetrics(node).height);
    });
    // Strict Mode reconnects effects on mount. Keep the restored placement
    // intact instead of solving it again from the spring preferences.
    if (previous?.id === doc?.id && previous?.nodes === nodes && previous?.species === doc?.species && previous.potSize === potSize && scene.current.size) { paint(); wake(); return; }
    layoutInputs.current = { id: doc?.id, nodes, species: doc?.species, potSize };
    const changed = documentId.current !== doc?.id;
    if (elastic.current) { savePlacement(); elastic.current = null; }
    documentId.current = doc?.id;
    if (changed) { scene.current.clear(); cancelAnimationFrame(frame.current); frame.current = 0; }
    if (!doc) { setEntries([]); return; }
    const arrangement = documents.current.get(doc.id) ?? doc.arrangement ?? { positions: new Map(), preferences: new Map() };
    // Keep each edited card's bottom branch attachment steady. Commit the new
    // collision-free footprint together so a larger card never grows through
    // a neighbor while waiting for the normal layout animation.
    if (reshaped.length) {
      arrangement.positions = new Map(arrangement.positions);
      for (const node of reshaped) {
        const point = arrangement.positions.get(node.id);
        if (point) arrangement.positions.set(node.id, { x: point.x, y: point.y + nodeMetrics(previousNodes.get(node.id)).height - nodeMetrics(node).height });
      }
    }
    const speciesChanged = arrangement.species !== doc.species;
    if (speciesChanged) { arrangement.preferences = new Map(); arrangement.species = doc.species; }
    if (!arrangement.pot) {
      const root = arrangement.positions.get('[]') ?? { x: 0, y: 0 };
      arrangement.pot = { node: POT_NODE, x: root.x, y: root.y + NODE_HEIGHT + 32, opacity: 1, angle: 0 };
    }
    const potNode = { ...POT_NODE, potSettings: potSettings(doc) };
    arrangement.pot = { ...arrangement.pot, node: potNode, opacity: 1, angle: 0 };
    if (potResized) {
      arrangement.pot.y += 11 * (previous.potSize - potSize);
      const root = arrangement.positions.get('[]');
      if (root && doc.byId.has('[]')) {
        const world = new CollisionWorld([{ node: doc.byId.get('[]'), ...root }]);
        while (!world.canPlace(arrangement.pot)) arrangement.pot.y += 8;
      }
    }
    if (!scene.current.has(POT_ID) || potResized) scene.current.set(POT_ID, { ...arrangement.pot });
    if (nodes.length && !arrangement.positions.has('[]')) {
      const root = arrangement.lastRoot ?? { x: arrangement.pot.x, y: arrangement.pot.y - NODE_HEIGHT - 32 };
      const world = new CollisionWorld([arrangement.pot]);
      arrangement.positions.set('[]', world.canPlace({ node: nodes[0], ...root }) ? root : { x: arrangement.pot.x, y: arrangement.pot.y - NODE_HEIGHT - 32 });
    }
    const restorePlacement = changed && !speciesChanged && nodes.length === arrangement.positions.size && nodes.every(node => arrangement.positions.has(node.id));
    const positions = restorePlacement ? arrangement.positions : branchLayout(nodes, arrangement.positions, arrangement.preferences, [arrangement.pot], getSpecies(doc.species));
    const visible = new Set(nodes.map(node => node.id)), affected = new Set();
    visible.add(POT_ID);
    if (speciesChanged || potResized || reshaped.length) for (const [id] of scene.current) {
      // A restyle can interrupt folding. Retired cards must disappear before
      // the new crown occupies their old space.
      if (visible.has(id)) continue;
      elements.current.get(id)?.setAttribute('opacity', '0');
      scene.current.delete(id);
    }
    arrangement.positions = positions;
    if (positions.has('[]')) arrangement.lastRoot = positions.get('[]');
    documents.current.set(doc.id, arrangement);
    doc.arrangement = arrangement;
    onDirty();
    const now = performance.now();
    function ancestor(node) {
      let parent = doc.byId.get(node.parent);
      while (parent && !visible.has(parent.id)) parent = doc.byId.get(parent.parent);
      return parent;
    }
    for (const node of nodes) {
      let item = scene.current.get(node.id);
      if (item) item.node = node;
      const target = positions.get(node.id), parent = ancestor(node);
      if (item && (speciesChanged || reshaped.length || potResized)) {
        // Restyling is an explicit whole-tree operation. Commit the complete
        // collision-free solution together so old animation paths cannot pin
        // crossing branches to the previous species' silhouette.
        Object.assign(item, { x: target.x, y: target.y, opacity: 1, angle: 0, motion: null, pending: false, exiting: false });
        continue;
      }
      if (item && !item.exiting) {
        const previous = item.motion ? { x: item.motion.toX, y: item.motion.toY } : item;
        if (Math.hypot(previous.x - target.x, previous.y - target.y) > .01) {
          item.motion = { x: item.x, y: item.y, opacity: item.opacity, toX: target.x, toY: target.y, toOpacity: 1, start: now, duration: 760 };
          affected.add(node.id);
        }
        continue;
      }
      if (!item) {
        item = { node, x: target.x, y: target.y, opacity: changed ? 1 : 0, angle: 0, pending: !changed };
        scene.current.set(node.id, item);
      }
      item.exiting = false;
      if (!changed) {
        item.motion = { x: item.x, y: item.y, opacity: item.opacity, toX: target.x, toY: target.y, toOpacity: 1, start: now, duration: 760 };
        if (parent) affected.add(parent.id);
      }
    }
    for (const [id, item] of scene.current) {
      if (visible.has(id) || item.exiting) continue;
      const parent = ancestor(item.node);
      item.exiting = true;
      item.pending = false;
      item.motion = { x: item.x, y: item.y, opacity: item.opacity, toX: item.x, toY: item.y, toOpacity: 0, start: now, duration: 220 };
      if (parent) affected.add(parent.id);
    }
    for (const item of scene.current.values()) {
      if (!item.motion && (affected.has(item.node.id) || affected.has(item.node.parent))) {
        item.motion = { x: item.x, y: item.y, opacity: item.opacity, toX: item.x, toY: item.y, toOpacity: 1, start: now, duration: 620 };
      }
    }
    setEntries([...scene.current.values()]); paint(); wake();
  }, [doc?.id, doc?.species, doc?.potSettings, nodes, paint, wake, onDirty, savePlacement]);
  useLayoutEffect(paint, [entries, paint, doc?.trunkSettings]);
  const register = useCallback((id, element) => { if (element) elements.current.set(id, element); else elements.current.delete(id); }, []);
  const registerEdge = useCallback((id, element) => { if (element) edges.current.set(id, element); else edges.current.delete(id); }, []);
  const move = useCallback((id, point) => {
    const item = scene.current.get(id);
    if (!item || item.exiting) return;
    if (id === POT_ID) {
      elastic.current = null;
      const world = new CollisionWorld([...scene.current.values()].filter(entry => !entry.pending && entry.opacity > .001));
      const delta = world.move([id], { x: point.x - item.x, y: point.y - item.y });
      item.x += delta.x; item.y += delta.y;
    } else {
      if (!elastic.current || elastic.current.id !== id || !elastic.current.held) {
        for (const entry of scene.current.values()) if (!entry.exiting && !entry.pending) { entry.motion = null; entry.angle = 0; entry.opacity = 1; }
        elastic.current = new ElasticDrag(scene.current, id);
      }
      elastic.current.aim(point);
      elastic.current.step(1 / 60, true);
      wake();
    }
    savePlacement(); paint(); onDirty();
  }, [paint, wake, savePlacement, onDirty]);
  const bounds = useCallback(() => graphBounds(new Map([...scene.current].filter(([, item]) => !item.exiting).map(([id, item]) => [id, { x: item.motion?.toX ?? item.x, y: item.motion?.toY ?? item.y, node: item.node }]))), []);
  const commitPlacement = useCallback(() => {
    const arrangement = documents.current.get(documentId.current);
    if (!arrangement) return;
    const simulation = elastic.current;
    if (simulation) {
      // Keep the original flexible joints as their preferred shape. Only the
      // node deliberately moved by the user gets a new parent-relative anchor.
      for (const id of simulation.followers) {
        if (id !== simulation.id && simulation.offsets.has(id)) arrangement.preferences.set(id, simulation.offsets.get(id));
      }
      simulation.release();
      const item = scene.current.get(simulation.id), parent = scene.current.get(item?.node.parent);
      if (parent) arrangement.preferences.set(simulation.id, { x: item.x - parent.x, y: item.y - parent.y });
      savePlacement(); onDirty(); wake(); return;
    }
    for (const node of liveNodes.current) {
      const parent = arrangement.positions.get(node.parent), child = arrangement.positions.get(node.id);
      if (parent && child) arrangement.preferences.set(node.id, { x: child.x - parent.x, y: child.y - parent.y });
    }
    if (liveDoc.current) liveDoc.current.arrangement = arrangement;
    onDirty();
  }, [onDirty, savePlacement, wake]);
  return { entries, scene, register, registerEdge, move, bounds, commitPlacement };
}

export default function TreeCanvas({ doc, nodes, hidden, query, graphApi, onZoom, onSelect, onToggle, onCollapse, onAdd, onDelete, onDirty, onAppearance, onPotChange, onEdit }) {
  const container = useRef(null), cameras = useRef(new Map()), cameraRef = useRef(initialCamera), drag = useRef(null), pointers = useRef(new Map());
  const currentDoc = useRef(null), suppressClick = useRef(false), viewport = useRef({ width: 0, height: 0 });
  const [camera, setCameraState] = useState(initialCamera), [size, setSize] = useState({ width: 1, height: 1 }), [dragging, setDragging] = useState(false);
  const { entries, scene, register, registerEdge, move, bounds, commitPlacement } = useBranches(doc, nodes, onDirty);
  const liveDoc = useRef(doc); liveDoc.current = doc;
  const setCamera = useCallback(next => {
    cameraRef.current = next; setCameraState(next);
    if (currentDoc.current) cameras.current.set(currentDoc.current, next);
    if (liveDoc.current?.id === currentDoc.current) { liveDoc.current.camera = next; onDirty(); }
    onZoom(Math.round(next.scale * 100));
  }, [onZoom, onDirty]);
  const fit = useCallback((opening = false) => {
    // Vite can mount React before its imported stylesheet finishes loading.
    if (!container.current || getComputedStyle(container.current).touchAction !== 'none') return;
    const rect = container.current?.getBoundingClientRect();
    if (!scene.current.size || !rect?.width || !rect?.height) return;
    viewport.current = { width: rect.width, height: rect.height };
    setSize(viewport.current);
    const next = fitCamera(bounds(), rect);
    setCamera(opening && next.scale < .8 ? zoomCamera(next, .8 / next.scale, { x: rect.width / 2, y: rect.height / 2 }) : next);
  }, [bounds, scene, setCamera]);
  const zoom = useCallback((factor, origin) => {
    const rect = container.current?.getBoundingClientRect();
    if (!doc || !rect?.width) return;
    setCamera(zoomCamera(cameraRef.current, factor, origin ?? { x: rect.width / 2, y: rect.height / 2 }));
  }, [doc?.id, setCamera]);
  const zoomToNode = useCallback(id => {
    const item = scene.current.get(id), rect = container.current?.getBoundingClientRect();
    if (!item || !rect?.width) return;
    const metrics = nodeMetrics(item.node), scale = Math.min(MAX_ZOOM, Math.max(cameraRef.current.scale, 1 / metrics.scale));
    setCamera({ scale, x: rect.width / 2 - item.x * scale, y: rect.height / 2 - (item.y + metrics.height / 2) * scale });
  }, [scene, setCamera]);
  useImperativeHandle(graphApi, () => ({ fit, zoom }), [fit, zoom]);
  useLayoutEffect(() => {
    if (currentDoc.current === doc?.id) return;
    currentDoc.current = doc?.id; drag.current = null; pointers.current.clear(); setDragging(false);
    if (cameras.current.has(doc?.id)) setCamera(cameras.current.get(doc.id)); else if (doc?.camera) setCamera(doc.camera); else fit(true);
  }, [doc?.id, fit, setCamera]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (getComputedStyle(container.current).touchAction !== 'none') return;
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      const previous = viewport.current;
      const hasCamera = cameras.current.has(currentDoc.current);
      if (previous.width === width && previous.height === height && hasCamera) return;
      viewport.current = { width, height }; setSize({ width, height });
      if (!previous.width || !hasCamera) fit(true);
      else setCamera({ ...cameraRef.current, x: cameraRef.current.x + (width - previous.width) / 2, y: cameraRef.current.y + (height - previous.height) / 2 });
    });
    observer.observe(container.current); return () => observer.disconnect();
  }, [fit, setCamera]);
  useEffect(() => {
    const element = container.current;
    const wheel = event => {
      if (!doc || drag.current?.nodeId) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * .0018), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom, doc?.id]);

  const nodePointerDown = useCallback((event, id) => {
    if (event.button !== 0 || event.target.closest('.svg-expand, .svg-switch, .svg-node-actions, .svg-edge-add, .svg-pot-add, .node-shape-handle')) return;
    event.stopPropagation();
    if (drag.current) return;
    suppressClick.current = false;
    const item = scene.current.get(id);
    drag.current = { nodeId: id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: { x: item.x, y: item.y }, scale: cameraRef.current.scale, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [scene]);
  function pointerDown(event) {
    if (!doc || event.target.closest('.svg-node, .pot-node, .svg-edge-add, .empty-root-button') || event.button !== 0 || drag.current?.nodeId) return;
    suppressClick.current = false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    container.current.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, camera: { ...cameraRef.current } };
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { pinch: true, distance: Math.hypot(a.x - b.x, a.y - b.y), camera: { ...cameraRef.current }, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  }
  function pointerMove(event) {
    const start = drag.current;
    if (!start) return;
    if (start.nodeId) {
      if (event.pointerId !== start.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 4) return;
      start.moved = true; suppressClick.current = true; setDragging(true);
      move(start.nodeId, { x: start.origin.x + dx / start.scale, y: start.origin.y + dy / start.scale });
      return;
    }
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (start.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], rect = container.current.getBoundingClientRect();
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = zoomCamera(start.camera, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, start.distance), { x: start.center.x - rect.left, y: start.center.y - rect.top });
      next.x += center.x - start.center.x; next.y += center.y - start.center.y; setCamera(next);
    } else if (!start.pinch) setCamera({ ...start.camera, x: start.camera.x + event.clientX - start.x, y: start.camera.y + event.clientY - start.y });
  }
  function pointerUp(event) {
    if (drag.current?.nodeId) {
      if (event.pointerId !== drag.current.pointerId) return;
      if (drag.current.moved) commitPlacement();
      drag.current = null; setDragging(false); return;
    }
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 1) { const p = [...pointers.current.values()][0]; drag.current = { ...p, camera: { ...cameraRef.current } }; }
    else { drag.current = null; setDragging(false); }
  }
  function keyDown(event) {
    if (!doc) return;
    const node = event.target.closest('.svg-node, .pot-node');
    if (node === event.target && node.dataset.nodeId !== POT_ID && ['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      const id = node.dataset.nodeId;
      if (nodeDetailLevel(scene.current.get(id).node, cameraRef.current.scale) !== 'full') zoomToNode(id);
      else onDelete(id);
      return;
    }
    const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
    if (delta && node === event.target) {
      const id = node.dataset.nodeId, item = scene.current.get(id);
      event.preventDefault(); move(id, { x: item.x + delta[0], y: item.y + delta[1] }); commitPlacement(); return;
    }
    if (event.target !== event.currentTarget) return;
    if (delta) { event.preventDefault(); const c = cameraRef.current; setCamera({ ...c, x: c.x - delta[0], y: c.y - delta[1] }); }
    if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); zoom(event.key === '-' ? 1 / 1.2 : 1.2); }
    if (event.key === '0') fit();
  }
  const root = doc?.nodes[0], rootValue = root && !['array', 'object'].includes(root.type) ? JSON.stringify(root.value) : '';
  const noMatches = query.trim() && nodes.length === 1 && !`${doc?.name} ${rootValue}`.toLowerCase().includes(query.trim().toLowerCase());
  const gridStep = 20 * 2 ** Math.max(0, Math.ceil(Math.log2(1 / camera.scale)));
  const simplified = nodes.some(node => nodeDetailLevel(node, camera.scale) !== 'full');
  return <div id="tree-view" ref={container} role="tabpanel" aria-labelledby="tree-tab" className={`tree-view ${dragging ? 'dragging' : ''}`} hidden={hidden} tabIndex={0} aria-label="JSON tree. Drag nodes to move them or the background to pan. Scroll to zoom. Arrow keys move a focused node or pan the canvas." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} onKeyDown={keyDown} onClickCapture={event => { if (suppressClick.current) { event.stopPropagation(); suppressClick.current = false; } }}>
    {!!entries.length && doc && <svg id="graph-world" className="tree-svg" width="100%" height="100%" viewBox={cameraViewBox(camera, size)} preserveAspectRatio="none" aria-label="Bottom-rooted JSON tree">
      <defs><pattern id="bonsai-dot-grid" patternUnits="userSpaceOnUse" width={gridStep} height={gridStep}><circle cx={gridStep / 2} cy={gridStep / 2} r={.8 / camera.scale} fill="var(--line,#304034)" /></pattern></defs>
      <rect className="world-grid" x={-camera.x / camera.scale} y={-camera.y / camera.scale} width={size.width / camera.scale} height={size.height / camera.scale} fill="url(#bonsai-dot-grid)" />
      {scene.current.has(POT_ID) && <g ref={element => register(POT_BACK_ID, element)} className="pot-back-layer" aria-hidden="true" onPointerDown={event => nodePointerDown(event, POT_ID)} onClick={event => event.stopPropagation()}><PotArtwork settings={doc.potSettings} layer="back" /></g>}
      <g>{scene.current.has('[]') && <Edge id={POT_ID} parent={doc.byId.get('[]')} register={registerEdge} onAdd={onAdd} detail={nodeDetailLevel(doc.byId.get('[]'), camera.scale)} />}{entries.filter(item => item.node.parent !== null && scene.current.has(item.node.parent)).map(({ node }) => <Edge key={node.id} id={node.id} parent={doc.byId.get(node.parent)} off={!isIncluded(doc, node)} register={registerEdge} onAdd={onAdd} detail={nodeDetailLevel(doc.byId.get(node.parent), camera.scale)} />)}</g>
      {entries.map(({ node, exiting }) => node.kind === 'pot' ? <g key={POT_ID} ref={element => register(POT_ID, element)} className="pot-node" data-node-id={POT_ID} data-detail={nodeDetailLevel(node, camera.scale)} role="group" tabIndex={0} aria-label="Bonsai pot. Drag independently of the root." onPointerDown={event => nodePointerDown(event, POT_ID)} onClick={event => event.stopPropagation()}><PotControls settings={doc.potSettings} onChange={onPotChange} /></g> : <SvgNode key={node.id} node={node} included={isIncluded(doc, node)} ownIncluded={!doc.excluded.has(node.id)} collapsed={doc.collapsed.has(node.id)} selected={doc.selected === node.id} exiting={exiting} register={register} onDrag={nodePointerDown} onSelect={onSelect} onToggle={onToggle} onCollapse={onCollapse} onAdd={onAdd} onDelete={onDelete} onAppearance={onAppearance} zoom={camera.scale} onZoomToNode={zoomToNode} onEdit={onEdit} />)}
    </svg>}
    <div id="tree-empty" className="tree-empty" hidden={!noMatches}>No matching branches.</div>
    {simplified && !noMatches && <span className="zoom-detail-note" aria-hidden="true">Zoom in to edit</span>}
    {doc?.empty && <button className="primary-button empty-root-button" onClick={() => onAdd(null)}>Add root node</button>}
  </div>;
}
