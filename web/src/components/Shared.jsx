import { isIncluded } from '../core.js';

export const typeSymbols = { object: '{}', array: '[]', string: 'Aa', number: '#', boolean: '◐', null: '∅' };
export const typeLabel = node => node.type === 'object' ? `${node.children.length} ${node.children.length === 1 ? 'property' : 'properties'}` : node.type === 'array' ? `${node.children.length} ${node.children.length === 1 ? 'item' : 'items'}` : JSON.stringify(node.value);
export function bytes(value) {
  const size = typeof value === 'number' ? value : new TextEncoder().encode(value).length;
  return size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;
}
export function Icon({ name, ...props }) {
  return <svg className="icon" aria-hidden="true" {...props}><use href={`${import.meta.env.BASE_URL}icons.svg#i-${name}`} /></svg>;
}
export function IconButton({ icon, label, onClick, ...props }) {
  return <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClick} {...props}><Icon name={icon} /></button>;
}
export function NodeSwitch({ doc, node, onToggle }) {
  if (node.parent === null) return <span className="node-root-label">ROOT</span>;
  const included = !doc.excluded.has(node.id), inherited = included && !isIncluded(doc, node);
  return <button type="button" className={`node-switch${inherited ? ' inherited-off' : ''}`} role="switch" aria-checked={included} aria-label={`Include ${node.key} in export`} title={`${inherited ? 'Parent branch is pruned. ' : ''}${included ? 'Prune' : 'Restore'} this branch`} onClick={event => { event.stopPropagation(); onToggle(node.id); }} />;
}
export function ExpandButton({ doc, node, onCollapse }) {
  if (!node.children.length) return <span className="list-spacer" />;
  const collapsed = doc.collapsed.has(node.id);
  return <button type="button" className="node-expand" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.key}`} aria-expanded={!collapsed} onClick={event => { event.stopPropagation(); onCollapse(node.id); }}><Icon name={collapsed ? 'plus' : 'minus'} /></button>;
}
export function BrandMark() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 29V17m0 8-9-8m9 4 9-10M9 32h22l-4 5H13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><ellipse cx="11" cy="13" rx="8" ry="6" fill="currentColor" /><ellipse cx="27" cy="9" rx="10" ry="7" fill="currentColor" /></svg>;
}
export function GardenArt() {
  return <div className="garden-art" aria-hidden="true"><svg viewBox="0 0 180 108" fill="none"><path d="M21 90h140M91 81V43m0 23L62 48m29 8 28-30m-28 47 25-13" stroke="#668064" strokeWidth="2" strokeLinecap="round" /><path d="M68 84h48l-9 15H77Z" fill="#b1b99e" /><ellipse cx="60" cy="41" rx="27" ry="15" fill="#d7ddc5" /><ellipse cx="116" cy="29" rx="30" ry="20" fill="#aabb95" /><ellipse cx="111" cy="59" rx="23" ry="12" fill="#c0cdaa" /><path d="m82 99-4 5m26-5 4 5" stroke="#8b977b" strokeWidth="2" /></svg></div>;
}
