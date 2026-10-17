import { memo, useMemo } from 'react';
import { branchPaths } from '../graph.js';
import { getSpecies } from '../species.js';
import { miniatureLayout } from '../miniature.js';
import { growthPreferences } from '../growth.js';
import { trunkProfile, trunkSettings } from '../trunk.js';

// Tiny living silhouettes come from each document's actual branches. The
// foliage stays illustrative so even a large JSON file makes a readable tree.
export default memo(function BenchTree({ doc, revision }) {
  const miniature = useMemo(() => miniatureLayout(doc), [doc.nodes, doc.excluded, doc.species, doc.empty, revision]);
  const shape = ['pine', 'juniper'].includes(doc.species) ? 'conifer' : 'broadleaf';
  const potX = miniature?.potX ?? 80;
  const trunk = getSpecies(doc.species).trunk;
  const growth = useMemo(() => growthPreferences(doc.nodes, doc.species), [doc.nodes, doc.species]);
  const profile = miniature && trunkProfile(doc.nodes, doc.arrangement?.positions ?? miniature.raw, miniature.rawPot, trunk, trunkSettings(doc), growth);
  const scale = profile ? Math.max(.07, Math.min(.28, 74 / profile.totalHeight)) : .2;
  const paths = miniature ? miniature.nodes.map(node => {
    const child = miniature.positions.get(node.id), parent = miniature.positions.get(node.parent) ?? { x: potX, y: 109 };
    const widths = profile.edge(node);
    return { id: node.id, ...branchPaths(parent, child, 1, 1, { ...trunk, baseRadius: widths.baseRadius * scale, tipRadius: widths.tipRadius * scale }) };
  }) : [];
  return <svg className={`bench-miniature ${shape}`} viewBox="0 0 160 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <ellipse cx={potX} cy="122" rx="38" ry="5" fill="#080d0a" opacity=".5" />
    <g className="mini-pot-back"><ellipse cx={potX} cy="108" rx="34" ry="6" fill="#916a4d" stroke="#b38b65" /><ellipse cx={potX} cy="107" rx="29" ry="3.5" fill="#302b20" /></g>
    <g className="mini-wood">{paths.map(path => <path key={path.id} data-mini-branch-id={path.id} d={path.body} className="mini-wood-body" />)}{paths.map(path => <path key={path.id} d={path.grain} className="mini-wood-grain" style={{ strokeWidth: scale }} />)}</g>
    <g className="mini-foliage">{miniature?.foliage.map(node => {
      const p = miniature.positions.get(node.id), radius = miniature.radius;
      return <g key={node.id} data-mini-node-id={node.id} transform={`translate(${p.x} ${p.y})`}><ellipse className="mini-leaves" rx={radius * 1.3} ry={radius * (shape === 'conifer' ? .5 : .8)} /><ellipse className="mini-leaf-light" cx={-radius * .25} cy={-radius * .25} rx={radius * .8} ry={radius * (shape === 'conifer' ? .3 : .5)} /></g>;
    })}</g>
    <g className="mini-pot-front" transform={`translate(${potX - 80} 0)`}><path d="M47 108 Q80 115 113 108 L107 121 Q80 127 53 121Z" className="mini-pot" /><path d="M57 123v3m46-3v3" stroke="#6e4e3d" strokeWidth="4" strokeLinecap="round" /><path d="M46 108 Q80 120 114 108" stroke="#b38b65" fill="none" /></g>
    {doc.empty && <path d={`M${potX - 12} 107q6-5 12 0m5 0q4-4 8-1`} stroke="#7a8a52" strokeWidth="2" fill="none" />}
  </svg>;
});
