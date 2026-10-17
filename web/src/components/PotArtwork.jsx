import { useId } from 'react';
import { getPotPreset } from '../pot.js';

export default function PotArtwork({ settings, layer = 'all' }) {
  const gradient = `pot-glaze-${useId().replace(/:/g, '')}`;
  const preset = getPotPreset(settings);
  const bodyPath = layer === 'front' ? preset.body.replace(/Z$/, 'Q0 125 -103 109Z') : preset.body;
  const body = <path className="pot-body" d={bodyPath} style={{ fill: `url(#${gradient})` }} />;
  return <g className={`pot-artwork pot-${preset.id}`} transform="translate(0 -96)" aria-hidden="true" style={{ '--pot-rim': preset.rim, '--pot-edge': preset.edge, '--pot-dark': preset.dark }}>
    <defs><linearGradient id={gradient} x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stopColor={preset.light} /><stop offset=".5" stopColor={preset.rim} /><stop offset="1" stopColor={preset.dark} /></linearGradient></defs>
    {layer !== 'front' && <>
      <ellipse className="pot-shadow" cx="0" cy={preset.feet + 10} rx="104" ry="5" />
      <rect className="pot-feet" x="-77" y={preset.feet} width="25" height="11" rx="4" />
      <rect className="pot-feet" x="52" y={preset.feet} width="25" height="11" rx="4" />
      {body}
      <ellipse className="pot-rim" cx="0" cy="109" rx="108" ry="13" />
      <ellipse className="pot-soil" cx="0" cy="107" rx="98" ry="8" />
      <path className="pot-moss" d="M-83 108 Q-68 98-49 105 Q-38 108-30 106 M43 107 Q59 101 77 108" />
    </>}
    {layer === 'front' && body}
    {layer !== 'back' && <>
      <path className="pot-highlight" d="M-85 122 Q0 149 85 122" />
      <path className="pot-lip" d="M-107 110 Q0 132 107 110" />
    </>}
  </g>;
}
