import { useRef } from 'react';
import PotArtwork from './PotArtwork.jsx';
import { cyclePotPreset, getPotPreset, normalizePotSettings } from '../pot.js';

export default function PotControls({ settings, onChange }) {
  const drag = useRef(null), current = normalizePotSettings(settings);
  function update(event) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(state.inverse);
    const size = Math.round(Math.max(60, Math.min(160, 60 + (point.x + 34) / 68 * 100))) / 100;
    if (size === state.last) return;
    onChange({ size }, state.first); state.first = false; state.last = size;
  }
  function finish(event) { event.stopPropagation(); drag.current = null; }
  return <>
    <PotArtwork settings={current} layer="front" />
    <g className="pot-controls" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      {[-1, 1].map(direction => <g key={direction} className="pot-preset-arrow" transform={`translate(${direction * 124} 40)`} role="button" tabIndex={0} aria-label={direction < 0 ? 'Previous pot preset' : 'Next pot preset'}
        onClick={() => onChange({ preset: cyclePotPreset(current, direction) }, true)}
        onKeyDown={event => { if (!['Enter', ' '].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); onChange({ preset: cyclePotPreset(current, direction) }, true); }}>
        <title>{direction < 0 ? 'Previous' : 'Next'} pot · {getPotPreset(current).name}</title>
        <circle className="pot-control-hit" r="13" /><path className="pot-control-arrow" d={`M${-direction * 3} -5L${direction * 2} 0L${-direction * 3} 5`} />
      </g>)}
      <g className="pot-size-slider" role="slider" tabIndex={0} aria-label="Pot size" aria-valuemin={60} aria-valuemax={160} aria-valuenow={Math.round(current.size * 100)} aria-valuetext={`${Math.round(current.size * 100)}%`} aria-orientation="horizontal"
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, inverse: event.currentTarget.getScreenCTM().inverse(), first: true, last: current.size }; update(event);
        }} onPointerMove={update} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onKeyDown={event => {
          const delta = { ArrowRight: .05, ArrowUp: .05, ArrowLeft: -.05, ArrowDown: -.05, PageUp: .1, PageDown: -.1 }[event.key];
          if (delta === undefined && !['Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const size = event.key === 'Home' ? .6 : event.key === 'End' ? 1.6 : Math.round((current.size + delta) * 100) / 100;
          onChange({ size }, true);
        }}>
        <title>Pot size: {Math.round(current.size * 100)}%</title>
        <rect className="pot-control-hit" x="-43" y="80" width="86" height="25" rx="8" />
        <path className="pot-size-track" d="M-34 92H34" />
        <circle className="pot-size-thumb" cx={-34 + (current.size - .6) * 68} cy="92" r="3.5" />
      </g>
    </g>
  </>;
}
