# Bonsai workflow

After each requested app update, run the relevant checks, deploy to
https://martinhundrup.com/bonsai/ using the existing `npm run deploy` workflow,
and verify the updated live site before reporting completion. The user expects
each update to be published unless they explicitly request local-only work.

Keep the existing deployment limited to the configured Bonsai routes.

Keep the UI minimal and readable. Expanding branches should gently displace
neighboring subtrees while preserving parent-relative spacing and avoiding
overlap. Keep the camera steady and existing cards mounted. Connections should
look like tapered tree trunks and limbs.

Use a dark theme with muted green nodes and warm brown trunks. Keep text and
controls readable against the dark surfaces.

Dragging or keyboard-moving a node carries all its descendants, preserving
their spacing. Siblings and ancestors stay fixed. Automatic rearrangement of
other branches belongs to expand/collapse, not manual movement. Keep a ceramic
pot beneath the root and gently reduce card sizes at higher tree levels, with a
readable minimum size.

Enforce collisions during dragging and every animation frame, including the
pot and card sway. A dragged subtree slides along stationary siblings instead
of passing through them. New cards wait for clear space before appearing;
closing cards reserve their space until faded out. Settled-layout checks alone
are insufficient.

The pot and root move independently. Moving the root carries JSON descendants
but never the pot. Hovering a branch reveals an add-child control for its parent
object or array. Every JSON node, including the root, can be deleted; Delete all
clears the document while retaining its pot. Structural edits update preview
and export and support undo/redo. An empty tree can create a new root.
