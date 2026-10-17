// The soil spans y=3..19 in local pot coordinates; the trunk enters past its midpoint.
export const POT_TRUNK_Y = 14;
export const potPresets = [
  { id: 'terracotta', name: 'Terracotta oval', light: '#a37150', dark: '#57382a', rim: '#966f4f', edge: '#c19b72', body: 'M-103 109 L-88 148 Q-84 161 0 162 Q84 161 88 148 L103 109Z', feet: 154 },
  { id: 'celadon', name: 'Celadon tray', light: '#7d9d8e', dark: '#344e47', rim: '#779b8b', edge: '#b7ccad', body: 'M-103 109 L-99 139 Q-98 146-87 146 H87 Q98 146 99 139 L103 109Z', feet: 142 },
  { id: 'cobalt', name: 'Cobalt bowl', light: '#55798e', dark: '#253a54', rim: '#607f98', edge: '#a0bac8', body: 'M-103 109 C-99 151-65 166 0 166 C65 166 99 151 103 109Z', feet: 159 },
  { id: 'ivory', name: 'Ivory drum', light: '#c4bca5', dark: '#70685b', rim: '#b8af99', edge: '#e0d7bb', body: 'M-103 109 L-99 151 Q-97 163 0 163 Q97 163 99 151 L103 109Z', feet: 155 },
];

export function normalizePotSettings(value) {
  return {
    preset: potPresets.some(preset => preset.id === value?.preset) ? value.preset : 'terracotta',
    size: Number.isFinite(value?.size) ? Math.max(.6, Math.min(1.6, value.size)) : 1,
  };
}
export const potSettings = doc => normalizePotSettings(doc?.potSettings);
export const getPotPreset = settings => potPresets.find(preset => preset.id === settings?.preset) ?? potPresets[0];
export function cyclePotPreset(current, direction) {
  const index = potPresets.findIndex(preset => preset.id === normalizePotSettings(current).preset);
  return potPresets[(index + direction + potPresets.length) % potPresets.length].id;
}
