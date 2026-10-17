export const MIN_ZOOM = 0.08;
export const MAX_ZOOM = 3;

export function fitCamera(layout, viewport) {
  const scale = Math.min(1.2, Math.max(MIN_ZOOM, Math.min((viewport.width - 36) / layout.width, (viewport.height - 36) / layout.height)));
  return { scale, x: (viewport.width - layout.width * scale) / 2 - (layout.x ?? 0) * scale, y: (viewport.height - layout.height * scale) / 2 - (layout.y ?? 0) * scale };
}

export function zoomCamera(camera, factor, origin) {
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.scale * factor));
  const ratio = scale / camera.scale;
  return { scale, x: origin.x - (origin.x - camera.x) * ratio, y: origin.y - (origin.y - camera.y) * ratio };
}

// Change the SVG viewport, not a CSS transform. Text and geometry are painted
// at their final resolution rather than enlarging a cached composited layer.
export function cameraViewBox(camera, viewport) {
  return [-camera.x / camera.scale, -camera.y / camera.scale, viewport.width / camera.scale, viewport.height / camera.scale].join(' ');
}
