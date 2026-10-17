import { useEffect, useRef, useState } from 'react';

export function useEditorFullscreen() {
  const panel = useRef(null), button = useRef(null), native = useRef(false);
  const [active, setActive] = useState(false);
  const restoreFocus = () => button.current?.focus({ preventScroll: true });

  useEffect(() => {
    function changed() {
      if (document.fullscreenElement === panel.current) {
        native.current = true; setActive(true);
      } else if (native.current) {
        native.current = false; setActive(false); restoreFocus();
      }
    }
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  useEffect(() => {
    if (!active) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Keep background controls out of keyboard navigation in the viewport
    // fallback too. App dialogs remain available while editing the tree.
    const siblings = [];
    for (let branch = panel.current; branch && branch.id !== 'root'; branch = branch.parentElement) {
      for (const sibling of branch.parentElement?.children ?? []) {
        if (sibling === branch || !(sibling instanceof HTMLElement) || sibling.tagName === 'DIALOG') continue;
        siblings.push([sibling, sibling.inert]); sibling.inert = true;
      }
    }
    function escape(event) {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      if (document.fullscreenElement === panel.current) document.exitFullscreen().catch(() => {});
      else { setActive(false); restoreFocus(); }
    }
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = overflow;
      for (const [element, inert] of siblings) element.inert = inert;
      document.removeEventListener('keydown', escape);
    };
  }, [active]);

  async function toggle() {
    if (active) {
      if (document.fullscreenElement === panel.current) await document.exitFullscreen();
      setActive(false); restoreFocus(); return;
    }
    setActive(true);
    if (document.fullscreenEnabled && panel.current?.requestFullscreen) {
      try { await panel.current.requestFullscreen(); }
      catch { /* The editor still fills the viewport when native fullscreen is unavailable. */ }
    }
  }
  return { panel, button, active, toggle };
}
