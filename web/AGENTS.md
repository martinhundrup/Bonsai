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

Trunk thickness follows one whole-tree profile from soil to tips, including
the distance through cards. Base girth depends on tree height and species;
forks split the flow without restarting thickness. Persist the per-tree base
thickness and taper sliders and apply them to the editor and bench miniature.
Bench labels wrap fully. Keep the clear-cookies-and-saved-trees button easy to
reach by pointer or keyboard; its confirmation must explain what it removes.
Clear only Bonsai storage and prevent autosave from restoring cleared trees.

Each node has two subtle, keyboard-accessible corner dots: an outer size handle
and an inset roundness handle. Drag outward to grow and inward to round. Full
rounding approaches a circle. Preserve node appearance by stable ID through
structural edits, undo/redo, and browser saves; keep JSON export unchanged.
The graph header also has all-node size and roundness sliders, including in
fullscreen. Each edits that property on every node in the current tree, including
collapsed and pruned branches, preserving the other property. Show Mixed when
individual values differ; save results and group each slider gesture into one undo step.
Use the customized footprint for collisions, branch endpoints, and camera fit.
Run the wood endpoints behind rounded foliage to hide clipped tangent seams.
Shape handles use circular focus rings, with no rectangular browser outline.
The active species tints the entire UI while retaining dark surfaces and readable
text. Pot arrows cycle presets; its subtle slider scales the real collision and
camera footprint. Preserve pot settings per tree through saves and undo/redo,
and reflect them in the bench. Resizing the pot must retain the root's placement.
Pot shadows contact the preset's feet. Paint soil behind the trunk and the curved
front wall above it; the trunk base reaches beyond the soil's midpoint. Keep the
pot's front and back transforms synchronized during dragging and resizing.
Type glyphs, pruned-node text, placeholders, and form labels use theme colors.
Export success appears only after the writable file has closed successfully.
Cancellation is silent. Download-link fallbacks cannot confirm completion and
must not show a saved notification.
Keep the size dot outside the corner. The tree editor supports fullscreen with
a visible exit button and Escape, including a viewport fallback. Preserve mounted
cards, placement, and zoom while the viewport changes; keep editing dialogs usable.
Keep species selection, base thickness, taper, and reset controls inside the graph
header so they remain available in fullscreen, including narrow mobile layouts.
Keep the species selector and both trunk sliders side by side in the top row;
secondary actions may wrap beneath them on narrow screens.
Adapt canvas detail to each node's projected size, including depth and custom
scale. Show full cards up close, large readable keys at medium zoom, and no text
at distant zoom. Keep the same underlying shape, size, and roundness at every
level. Hide tiny editing controls from painting,
pointer interaction, and keyboard navigation; retain node identities, geometry,
and saved data. Double-click or Enter opens the node editor, first zooming in
when the node is simplified. Object keys and all JSON values can be edited;
array indices follow their position. Preserve stable IDs and appearance when
renaming a branch, and support undo/redo of names, values, and source edits.
The right pane edits the full source with validation and Apply/Revert controls;
keep pruned output in a separate Export view. Unapplied drafts stay isolated per
tree. Invalid JSON must never change the tree, and source edits preserve pruning
and surviving node identities. Reflect node edits back into the source pane.
Keep syntax colors visible while editing. Invalid JSON highlights the error line,
gutter, and offending character (or end of input); show its line and column with
a keyboard-accessible jump to that location. Keep highlighting aligned during scrolling.

The pot and root move independently. Moving the root carries JSON descendants
but never the pot. Hovering a branch reveals an add-child control for its parent
object or array. Null nodes can grow children by converting to an object; this
conversion supports undo/redo. Every JSON node, including the root, can be deleted; Delete all
clears the document while retaining its pot. Structural edits update preview
and export and support undo/redo. An empty tree can create a new root.
