// These are visual growing preferences, rather than restrictions on JSON data.
function foliage(fill, root, border, accent, detail) {
  return {
    '--foliage-fill': fill, '--foliage-root': root, '--foliage-border': border,
    '--foliage-accent': accent, '--foliage-detail': detail,
  };
}

const palettes = {
  elm: foliage('#223b2a', '#2b4730', '#4b704e', '#a1c487', '#b2c99e'),
  maple: foliage('#47272f', '#573039', '#925365', '#e6a0ac', '#ddb4bb'),
  pine: foliage('#18382f', '#204537', '#3e7961', '#83c4a6', '#a5cabc'),
  juniper: foliage('#233b46', '#2c4854', '#527e91', '#96c8dc', '#b0cbd7'),
  ficus: foliage('#3b3d23', '#4a4b2a', '#7b804b', '#c9ce86', '#c9cca4'),
};

const trunks = {
  elm: { thickness: 1.05, taper: .68, taperAmount: 88, taperPower: 1.2, bend: 1.15, twist: .09, stem: 1, bark: '#a77b53', grain: '#e3bc8e' },
  maple: { thickness: .65, taper: .72, taperAmount: 93, taperPower: 1.1, bend: .8, twist: .03, stem: .85, bark: '#b38b76', grain: '#edcdb5' },
  pine: { thickness: 1.9, taper: .53, taperAmount: 90, taperPower: 1.35, bend: .35, twist: 0, stem: 1.5, bark: '#856147', grain: '#c9a27a' },
  juniper: { thickness: 1.35, taper: .55, taperAmount: 96, taperPower: 1.45, bend: 1.3, twist: .3, stem: .55, bark: '#a18d78', grain: '#e4d6ba' },
  ficus: { thickness: 2.55, taper: .42, taperAmount: 88, taperPower: 1.2, bend: .65, twist: .07, stem: .7, bark: '#95846b', grain: '#d9c9a4' },
};

export const species = [
  { id: 'elm', name: 'Chinese elm', styles: 'Informal upright · winding leader' },
  { id: 'maple', name: 'Japanese maple', styles: 'Radial fan · arched canopy' },
  { id: 'pine', name: 'Japanese black pine', styles: 'Strong apex · alternating branch pads' },
  { id: 'juniper', name: 'Juniper', styles: 'Windswept · spiraling branches' },
  { id: 'ficus', name: 'Ficus', styles: 'Banyan · spreading boughs & aerial roots' },
].map(item => ({ ...item, trunk: trunks[item.id], colors: { ...palettes[item.id], '--wood-fill': trunks[item.id].bark, '--wood-grain': trunks[item.id].grain } }));

export const getSpecies = id => species.find(item => item.id === id) ?? species[0];
