import { memo, useMemo } from 'react';
import { branchPaths } from '../graph.js';
import { getSpecies } from '../species.js';
import { miniatureLayout } from '../miniature.js';
import { growthPreferences } from '../growth.js';
import { trunkProfile, trunkSettings } from '../trunk.js';
import { nodeAppearance } from '../appearance.js';
import { potSettings, POT_TRUNK_Y } from '../pot.js';
import PotArtwork from './PotArtwork.jsx';

// Tiny living silhouettes come from each document's actual branches. The
// foliage stays illustrative so even a large JSON file makes a readable tree.
export default memo(function BenchTree({ doc, revision }) {
  const miniature = useMemo(() => miniatureLayout(doc), [doc.nodes, doc.excluded, doc.species, doc.empty, revision]);
  const shape = ['pine', 'juniper'].includes(doc.species) ? 'conifer' : 'broadleaf';
  const potX = miniature?.potX ?? 80;
  const pot = potSettings(doc), potScale = .23 * pot.size;
  const potTransform = `translate(${potX} ${104 - 11 * potScale}) scale(${potScale})`;
  const trunk = getSpecies(doc.species).trunk;
  const growth = useMemo(() => growthPreferences(doc.nodes, doc.species), [doc.nodes, doc.species]);
  const profile = miniature && trunkProfile(doc.nodes, doc.arrangement?.positions ?? miniature.raw, { ...miniature.rawPot, potSettings: pot }, trunk, trunkSettings(doc), growth);
  const scale = profile ? Math.max(.07, Math.min(.28, 74 / profile.totalHeight)) : .2;
  const paths = miniature ? miniature.nodes.map(node => {
    const child = miniature.positions.get(node.id), parent = miniature.positions.get(node.parent) ?? { x: potX, y: 104 + (POT_TRUNK_Y - 11) * potScale };
    const widths = profile.edge(node);
    return { id: node.id, ...branchPaths(parent, child, 1, 1, { ...trunk, baseRadius: widths.baseRadius * scale, tipRadius: widths.tipRadius * scale }) };
  }) : [];
  return <svg className={`bench-miniature ${shape}`} viewBox="0 0 160 132" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <g className="mini-pot-back" transform={potTransform}><PotArtwork settings={pot} layer="back" /></g>
    <g className="mini-wood">{paths.map(path => <path key={path.id} data-mini-branch-id={path.id} d={path.body} className="mini-wood-body" />)}{paths.map(path => <path key={path.id} d={path.grain} className="mini-wood-grain" style={{ strokeWidth: scale }} />)}</g>
    <g className="mini-foliage">{miniature?.foliage.map(node => {
      const p = miniature.positions.get(node.id), appearance = nodeAppearance(node.appearance), radius = miniature.radius * appearance.size;
      const height = (shape === 'conifer' ? .5 : .8) + appearance.rounding * (1.3 - (shape === 'conifer' ? .5 : .8));
      return <g key={node.id} data-mini-node-id={node.id} transform={`translate(${p.x} ${p.y})`}><ellipse className="mini-leaves" rx={radius * 1.3} ry={radius * height} /><ellipse className="mini-leaf-light" cx={-radius * .25} cy={-radius * .25} rx={radius * .8} ry={radius * height * .6} /></g>;
    })}</g>
    <g className="mini-pot-front" transform={potTransform}><PotArtwork settings={pot} layer="front" /></g>
    {doc.empty && <path d={`M${potX - 12} 104q6-5 12 0m5 0q4-4 8-1`} stroke="#7a8a52" strokeWidth="2" fill="none" />}
  </svg>;
});
