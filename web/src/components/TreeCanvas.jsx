import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isIncluded } from '../core.js';
import { branchLayout, branchPaths, branchWeights, graphBounds, nodeMetrics, NODE_WIDTH, NODE_HEIGHT, POT_ID, POT_NODE } from '../graph.js';
import { cameraViewBox, fitCamera, zoomCamera } from '../camera.js';
import { CollisionWorld } from '../collisions.js';
import { typeLabel, typeSymbols } from './Shared.jsx';

const initialCamera = { x: 0, y: 0, scale: 1 };
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

function RootPot() {
  return <g className="root-pot" transform="translate(0 -96)" aria-hidden="true">
    <ellipse className="pot-shadow" cx="0" cy="175" rx="104" ry="8" />
    <rect className="pot-feet" x="-77" y="154" width="25" height="11" rx="4" />
    <rect className="pot-feet" x="52" y="154" width="25" height="11" rx="4" />
    <path className="pot-body" d="M-103 109 L-88 148 Q-84 161 0 162 Q84 161 88 148 L103 109Z" />
    <path className="pot-highlight" d="M-87 121 L-78 145 Q-70 153-21 154" />
    <ellipse className="pot-rim" cx="0" cy="109" rx="108" ry="13" />
    <ellipse className="pot-soil" cx="0" cy="107" rx="98" ry="8" />
    <path className="pot-moss" d="M-83 108 Q-68 98-49 105 Q-38 108-30 106 M43 107 Q59 101 77 108" />
    <path className="pot-lip" d="M-107 110 Q0 132 107 110" />
  </g>;
}

function AddControl({ label, onClick, className = 'svg-edge-add' }) {
  return <g className={className} role="button" tabIndex={0} aria-label={label} onClick={event => activate(event, onClick)} onKeyDown={event => activate(event, onClick)}>
    <title>{label}</title><circle className="svg-add-disc" r="13" /><path className="svg-control-line" d="M-5 0H5M0-5V5" />
  </g>;
}

function Edge({ id, parent, off, register, onAdd }) {
  return <g ref={element => register(id, element)} data-edge-id={id} className={`tree-edge ${off ? 'off' : ''}`}>
    <path className="tree-edge-body" /><path className="tree-edge-grain" /><path className="tree-edge-hit" />
    {parent && ['object', 'array'].includes(parent.type) && <AddControl label={`Add node to ${parent.key}`} onClick={() => onAdd(parent.id)} />}
  </g>;
}

const SvgNode = memo(function SvgNode({ node, included, ownIncluded, collapsed, selected, exiting, register, onSelect, onToggle, onCollapse, onDrag, onAdd, onDelete }) {
  const x = -NODE_WIDTH / 2;
  return <g ref={element => register(node.id, element)} data-node-id={node.id} className={`graph-node svg-node ${node.parent === null ? 'root' : ''} ${included ? '' : 'off'} ${selected ? 'selected' : ''}`} tabIndex={exiting ? -1 : 0} role="group" aria-hidden={exiting || undefined} aria-label={`${node.key}, ${node.type}, ${included ? 'included' : 'pruned'}`} style={{ pointerEvents: exiting ? 'none' : undefined }} onPointerDown={event => onDrag(event, node.id)} onClick={event => { event.stopPropagation(); onSelect(node.id); }} onKeyDown={event => { if (event.target === event.currentTarget) activate(event, () => onSelect(node.id)); }}>
    <title>{`${node.key}: ${typeLabel(node)}`}</title>
    <rect className="svg-card" x={x} width={NODE_WIDTH} height={NODE_HEIGHT} rx="9" />
    <rect className={`svg-type-box ${node.type}`} x={x + 12} y="14" width="27" height="27" rx="6" />
    <text className={`svg-type-text ${node.type}`} x={x + 25.5} y="32" textAnchor="middle">{typeSymbols[node.type]}</text>
    <text className="svg-node-title" x={x + 48} y="32">{shorten(node.parent === null ? '$ root' : node.key, node.children.length ? 13 : 16)}</text>
    <text className="svg-node-value" x={x + 14} y="65">{shorten(typeLabel(node), 18)}</text>
    {!!node.children.length && <g className="svg-expand" role="button" tabIndex={exiting ? -1 : 0} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.key}`} aria-expanded={!collapsed} onClick={event => activate(event, () => onCollapse(node.id))} onKeyDown={event => activate(event, () => onCollapse(node.id))}>
      <title>{collapsed ? 'Expand branch' : 'Collapse branch'}</title><rect className="svg-hit-area" x={x + 176} y="4" width="38" height="40" rx="4" />
      <rect x={x + 185} y="15" width="20" height="20" rx="4" className="svg-expand-box" /><path d={`M${x + 190},25h10${collapsed ? `M${x + 195},20v10` : ''}`} className="svg-control-line" />
    </g>}
    {node.parent !== null && <g className={`svg-switch ${ownIncluded ? 'on' : ''} ${!included && ownIncluded ? 'inherited-off' : ''}`} role="switch" tabIndex={exiting ? -1 : 0} aria-checked={ownIncluded} aria-label={`Include ${node.key} in export`} onClick={event => activate(event, () => onToggle(node.id))} onKeyDown={event => activate(event, () => onToggle(node.id))}>
      <title>{`${!included && ownIncluded ? 'Parent branch is pruned. ' : ''}${ownIncluded ? 'Prune' : 'Restore'} this branch`}</title>
      <rect className="svg-hit-area" x={x + 174} y="43" width="40" height="37" rx="4" /><rect className="svg-switch-track" x={x + 177} y="54" width="28" height="16" rx="8" /><circle className="svg-switch-knob" cx={x + (ownIncluded ? 197 : 185)} cy="62" r="5" />
    </g>}
    <g className="svg-node-actions" transform="translate(44 -19)">
      <rect x="-15" y="-15" width="64" height="35" fill="transparent" />
      {['object', 'array'].includes(node.type) && <AddControl className="svg-node-add" label={`Add node to ${node.key}`} onClick={() => onAdd(node.id)} />}
      <g transform="translate(34 0)" className="svg-node-delete" role="button" tabIndex={exiting ? -1 : 0} aria-label={`Delete ${node.key}`} onClick={event => activate(event, () => onDelete(node.id))} onKeyDown={event => activate(event, () => onDelete(node.id))}><title>Delete node and its children</title><circle className="svg-add-disc" r="13" /><path className="svg-delete-line" d="M-5-4H5M-3-4V5H3V-4M-2-7H2" /></g>
    </g>
  </g>;
});

// Animate SVG geometry directly, keeping the keyed cards mounted and React out
// of the animation loop. Stationary cards retain their positions and markup.
function useBranches(doc, nodes) {
  const documents = useRef(new Map()), scene = useRef(new Map()), elements = useRef(new Map()), edges = useRef(new Map());
  const documentId = useRef(null), frame = useRef(0), reduced = useRef(false);
  const [entries, setEntries] = useState([]);
  const weights = useMemo(() => branchWeights(doc?.nodes ?? []), [doc?.nodes]);
  const weightsRef = useRef(weights); weightsRef.current = weights;
  const liveNodes = useRef(nodes); liveNodes.current = nodes;
  const paint = useCallback(() => {
    for (const [id, item] of scene.current) {
      const element = elements.current.get(id);
      if (element) {
        const metrics = nodeMetrics(item.node.depth, item.node.kind);
        const transform = `translate(${item.x} ${item.y}) rotate(${item.angle ?? 0} 0 ${metrics.height / 2}) scale(${metrics.scale})`;
        if (element.getAttribute('transform') !== transform) element.setAttribute('transform', transform);
        if (element.getAttribute('opacity') !== String(item.opacity)) element.setAttribute('opacity', item.opacity);
        if (element.dataset.moving !== String(!!item.motion)) element.dataset.moving = String(!!item.motion);
      }
      const edge = edges.current.get(id), parent = scene.current.get(item.node.parent);
      if (edge && parent) {
        const a = (parent.angle ?? 0) * Math.PI / 180, b = (item.angle ?? 0) * Math.PI / 180;
        const parentHalf = nodeMetrics(parent.node.depth).height / 2, childHalf = nodeMetrics(item.node.depth).height / 2;
        const x1 = parent.x + Math.sin(a) * parentHalf, y1 = parent.y + (1 - Math.cos(a)) * parentHalf;
        const x2 = item.x - Math.sin(b) * childHalf, y2 = item.y + (1 + Math.cos(b)) * childHalf;
        const paths = branchPaths({ x: x1, y: y1, angle: a }, { x: x2, y: y2, angle: b }, weightsRef.current.get(item.node.parent), weightsRef.current.get(id));
        paintEdge(edge, paths, Math.min(item.opacity, parent.opacity));
      }
    }
    const root = scene.current.get('[]'), pot = scene.current.get(POT_ID), stem = edges.current.get(POT_ID);
    if (root && pot && stem) {
      const half = nodeMetrics(root.node.depth).height / 2, angle = (root.angle ?? 0) * Math.PI / 180;
      const paths = branchPaths({ x: pot.x, y: pot.y + 11 }, { x: root.x - Math.sin(angle) * half, y: root.y + (1 + Math.cos(angle)) * half, angle }, weightsRef.current.get('[]'), weightsRef.current.get('[]'));
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
  }, [paint]);
  const wake = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(tick); }, [tick]);
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduced.current = media.matches; wake(); };
    update(); media.addEventListener('change', update);
    return () => { media.removeEventListener('change', update); cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [wake]);
  useLayoutEffect(() => {
    const changed = documentId.current !== doc?.id;
    documentId.current = doc?.id;
    if (changed) { scene.current.clear(); cancelAnimationFrame(frame.current); frame.current = 0; }
    if (!doc) { setEntries([]); return; }
    const arrangement = documents.current.get(doc.id) ?? { positions: new Map(), preferences: new Map() };
    if (!arrangement.pot) {
      const root = arrangement.positions.get('[]') ?? { x: 0, y: 0 };
      arrangement.pot = { node: POT_NODE, x: root.x, y: root.y + NODE_HEIGHT + 32, opacity: 1, angle: 0 };
    }
    if (!scene.current.has(POT_ID)) scene.current.set(POT_ID, { ...arrangement.pot });
    if (nodes.length && !arrangement.positions.has('[]')) {
      const root = arrangement.lastRoot ?? { x: arrangement.pot.x, y: arrangement.pot.y - NODE_HEIGHT - 32 };
      const world = new CollisionWorld([arrangement.pot]);
      arrangement.positions.set('[]', world.canPlace({ node: nodes[0], ...root }) ? root : { x: arrangement.pot.x, y: arrangement.pot.y - NODE_HEIGHT - 32 });
    }
    const restorePlacement = changed && nodes.length === arrangement.positions.size && nodes.every(node => arrangement.positions.has(node.id));
    const positions = restorePlacement ? arrangement.positions : branchLayout(nodes, arrangement.positions, arrangement.preferences, [arrangement.pot]);
    const visible = new Set(nodes.map(node => node.id)), affected = new Set();
    visible.add(POT_ID);
    arrangement.positions = positions;
    if (positions.has('[]')) arrangement.lastRoot = positions.get('[]');
    documents.current.set(doc.id, arrangement);
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
  }, [doc?.id, nodes, paint, wake]);
  useLayoutEffect(paint, [entries, paint]);
  const register = useCallback((id, element) => { if (element) elements.current.set(id, element); else elements.current.delete(id); }, []);
  const registerEdge = useCallback((id, element) => { if (element) edges.current.set(id, element); else edges.current.delete(id); }, []);
  const move = useCallback((id, point) => {
    const item = scene.current.get(id);
    if (!item || item.exiting) return;
    // Sweep the branch as one rigid group, sliding along stationary siblings
    // and ancestors instead of allowing it to tunnel through their cards.
    const requested = { x: point.x - item.x, y: point.y - item.y }, stack = [id], moving = [];
    const arrangement = documents.current.get(documentId.current);
    while (stack.length) {
      const next = stack.pop(), entry = scene.current.get(next);
      if (!entry || entry.exiting) continue;
      moving.push(next); stack.push(...entry.node.children);
    }
    const world = new CollisionWorld([...scene.current.values()].filter(entry => !entry.pending && entry.opacity > .001));
    const delta = world.move(moving, requested);
    for (const next of moving) {
      const entry = scene.current.get(next);
      entry.x += delta.x; entry.y += delta.y;
      if (next === id) { entry.motion = null; entry.angle = 0; entry.opacity = 1; }
      else if (entry.motion) {
        entry.motion.x += delta.x; entry.motion.y += delta.y;
        entry.motion.toX += delta.x; entry.motion.toY += delta.y;
      }
      if (next === POT_ID) arrangement.pot = { ...entry };
      else {
        arrangement.positions.set(next, { x: entry.motion?.toX ?? entry.x, y: entry.motion?.toY ?? entry.y });
        if (next === '[]') arrangement.lastRoot = arrangement.positions.get(next);
      }
    }
    paint();
  }, [paint]);
  const bounds = useCallback(() => graphBounds(new Map([...scene.current].filter(([, item]) => !item.exiting).map(([id, item]) => [id, { x: item.motion?.toX ?? item.x, y: item.motion?.toY ?? item.y, depth: item.node.depth, kind: item.node.kind }]))), []);
  const commitPlacement = useCallback(() => {
    const arrangement = documents.current.get(documentId.current);
    if (!arrangement) return;
    for (const node of liveNodes.current) {
      const parent = arrangement.positions.get(node.parent), child = arrangement.positions.get(node.id);
      if (parent && child) arrangement.preferences.set(node.id, { x: child.x - parent.x, y: child.y - parent.y });
    }
  }, []);
  return { entries, scene, register, registerEdge, move, bounds, commitPlacement };
}

export default function TreeCanvas({ doc, nodes, hidden, query, graphApi, onZoom, onSelect, onToggle, onCollapse, onAdd, onDelete }) {
  const container = useRef(null), cameras = useRef(new Map()), cameraRef = useRef(initialCamera), drag = useRef(null), pointers = useRef(new Map());
  const currentDoc = useRef(null), suppressClick = useRef(false), viewport = useRef({ width: 0, height: 0 });
  const [camera, setCameraState] = useState(initialCamera), [size, setSize] = useState({ width: 1, height: 1 }), [dragging, setDragging] = useState(false);
  const { entries, scene, register, registerEdge, move, bounds, commitPlacement } = useBranches(doc, nodes);
  const setCamera = useCallback(next => {
    cameraRef.current = next; setCameraState(next);
    if (currentDoc.current) cameras.current.set(currentDoc.current, next);
    onZoom(Math.round(next.scale * 100));
  }, [onZoom]);
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
  useImperativeHandle(graphApi, () => ({ fit, zoom }), [fit, zoom]);
  useLayoutEffect(() => {
    if (currentDoc.current === doc?.id) return;
    currentDoc.current = doc?.id; drag.current = null; pointers.current.clear(); setDragging(false);
    if (cameras.current.has(doc?.id)) setCamera(cameras.current.get(doc.id)); else fit(true);
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
    if (event.button !== 0 || event.target.closest('.svg-expand, .svg-switch, .svg-node-actions, .svg-edge-add, .svg-pot-add')) return;
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
    if (node === event.target && node.dataset.nodeId !== POT_ID && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); onDelete(node.dataset.nodeId); return; }
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
  return <div id="tree-view" ref={container} role="tabpanel" aria-labelledby="tree-tab" className={`tree-view ${dragging ? 'dragging' : ''}`} hidden={hidden} tabIndex={0} aria-label="JSON tree. Drag nodes to move them or the background to pan. Scroll to zoom. Arrow keys move a focused node or pan the canvas." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} onKeyDown={keyDown} onClickCapture={event => { if (suppressClick.current) { event.stopPropagation(); suppressClick.current = false; } }}>
    {!!entries.length && doc && <svg id="graph-world" className="tree-svg" width="100%" height="100%" viewBox={cameraViewBox(camera, size)} preserveAspectRatio="none" aria-label="Bottom-rooted JSON tree">
      <defs><linearGradient id="bonsai-pot-glaze" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stopColor="#946044" /><stop offset=".5" stopColor="#704936" /><stop offset="1" stopColor="#4c352b" /></linearGradient></defs>
      <g>{scene.current.has('[]') && <Edge id={POT_ID} parent={doc.byId.get('[]')} register={registerEdge} onAdd={onAdd} />}{entries.filter(item => item.node.parent !== null && scene.current.has(item.node.parent)).map(({ node }) => <Edge key={node.id} id={node.id} parent={doc.byId.get(node.parent)} off={!isIncluded(doc, node)} register={registerEdge} onAdd={onAdd} />)}</g>
      {entries.map(({ node, exiting }) => node.kind === 'pot' ? <g key={POT_ID} ref={element => register(POT_ID, element)} className="pot-node" data-node-id={POT_ID} role="group" tabIndex={0} aria-label="Bonsai pot. Drag independently of the root." onPointerDown={event => nodePointerDown(event, POT_ID)} onClick={event => event.stopPropagation()}><RootPot /></g> : <SvgNode key={node.id} node={node} included={isIncluded(doc, node)} ownIncluded={!doc.excluded.has(node.id)} collapsed={doc.collapsed.has(node.id)} selected={doc.selected === node.id} exiting={exiting} register={register} onDrag={nodePointerDown} onSelect={onSelect} onToggle={onToggle} onCollapse={onCollapse} onAdd={onAdd} onDelete={onDelete} />)}
    </svg>}
    <div id="tree-empty" className="tree-empty" hidden={!noMatches}>No matching branches.</div>
    {doc?.empty && <button className="primary-button empty-root-button" onClick={() => onAdd(null)}>Add root node</button>}
  </div>;
}
