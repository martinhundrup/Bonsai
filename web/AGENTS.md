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

Dragging or keyboard-moving a node carries its descendants on flexible joints.
Children bend around obstacles; neighboring cards can yield while springs pull
them toward their original placement and children toward their preferred
parent-relative spacing. Never lock a parent merely because a child meets
another card. Keep a ceramic pot beneath the root and gently reduce card sizes
at higher tree levels, with a readable minimum size.

Enforce collisions during dragging and every animation frame, including the
pot and card sway. Flexible branches and yielding neighbors move with continuous
collision checks instead of passing through each other. New cards wait for clear space before appearing;
closing cards reserve their space until faded out. Settled-layout checks alone
are insufficient.

Bench previews preserve relative node positions and fit width and height
independently so large trees remain visible. Paint all wood behind all foliage
and keep the front of the pot above the trunk base. Trunk geometry and bark
colors follow the species. The dot grid shares the canvas world coordinates.

Species have distinct deterministic growth rules: winding elm leaders, maple
fans, alternating pine pads, wind-swept juniper branches, and broad ficus boughs
with hanging roots. Keep their silhouettes and trunk girths visibly different.
An explicit species change retrains the whole visible crown in one valid
layout, retaining the root, pot, camera, and mounted cards. Ordinary expansion
and dragging retain their existing animations and manual preferences.

The pot and root move independently. Moving the root carries JSON descendants
but never the pot. Hovering a branch reveals an add-child control for its parent
object or array. Null nodes can grow children by converting to an object; this
conversion supports undo/redo. Every JSON node, including the root, can be deleted; Delete all
clears the document while retaining its pot. Structural edits update preview
and export and support undo/redo. An empty tree can create a new root.
