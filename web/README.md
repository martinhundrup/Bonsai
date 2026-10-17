# Bonsai

A React app for exploring, pruning, and exporting JSON. Everything runs in the browser. Imported JSON never leaves the device.

## Development on macOS, Linux, or Windows

Install Node.js **22.12 or newer**, then run these commands from this `web` directory:

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. npm scripts use Vite and Node directly, without operating-system-specific shell commands. The Windows `../start.ps1` launcher is an optional convenience; npm is the standard workflow on every platform.

```sh
npm test
npm run build
npm run preview
```

`npm test` runs pruning, camera, and branch-position regression tests. `npm run build` writes a static website to `dist/`; `npm run preview` serves that production build locally. Node is needed for development and builds; the deployed app needs only a static web host. Use a web server rather than opening the HTML with a `file://` URL.

## Deploy to martinhundrup.com/bonsai with Wrangler

The primary deployment uses **Cloudflare Workers Static Assets**. `wrangler.jsonc` owns only these routes:

Live deployment: **https://martinhundrup.com/bonsai/**. The Cloudflare Worker is `bonsai-json`. The domain's proxied `AAAA` record points to the originless placeholder `100::`; reuse that record when adding other project routes. HTTPS, asset loading, file import, pruning, JSON export, file isolation, undo, list view, and the mobile layout were verified against the live deployment on October 16, 2026.

Keep this app on static asset hosting without paid add-ons. Enabling a paid plan or adding billable backend services requires explicit user approval.

| URL | Handler |
| --- | --- |
| `martinhundrup.com/bonsai` | Redirect to the app's trailing-slash URL |
| `martinhundrup.com/bonsai/*` | Bonsai static assets |
| `martinhundrup.com/` | Reserved for the future main website; not handled by this deployment |
| Other project paths | Available for other Workers or hosting |

From this directory, on macOS, Linux, or Windows:

```sh
npm ci
npm run cf:login
npm run cf:whoami
npm run cf:check
npm run deploy
```

Login uses Cloudflare OAuth and the operating system's credential store. No API key needs to be pasted into chat or committed. This project pins its local Wrangler version. The target Cloudflare account is recorded in `wrangler.jsonc`; change it deliberately when deploying to a different account.

`cf:check` builds and validates the Wrangler configuration without publishing. `deploy` rebuilds, stages the site under `.cloudflare/assets/bonsai/`, then publishes the Worker and its two routes. The staging script uses Node filesystem APIs; no Bash or PowerShell is required. Generated assets, Wrangler state, and local environment files are ignored by Git.

To test Cloudflare's actual static asset routing locally:

```sh
npm run cf:preview
```

Open **http://localhost:8787/bonsai/**. The domain root and unrelated paths should return 404 in this local Worker because they belong to other future deployments. In production only the two Bonsai routes are assigned to this Worker.

The domain must have an active Cloudflare zone and a proxied DNS record for `martinhundrup.com`. If the domain has no existing website or origin, Cloudflare documents a proxied `AAAA` record for `@` pointing to the discard address `100::` as a placeholder. This enables path routing without creating a landing page. If an origin already exists, preserve its DNS record.

Official instructions: [Serve static assets under a path](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/), [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [Originless DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/).

## Alternative: deploy on Cloudflare Pages

1. Run `npm ci` and `npm run build`.
2. In Cloudflare, open **Workers & Pages → Create application → Get started → Drag and drop your files** (Pages Direct Upload).
3. Upload `dist`, or the prepared `artifacts/bonsai-static.zip`. The uploaded site root must contain `index.html`, `icons.svg`, and `assets/`.
4. Deploy, then open the Pages project's **Custom domains → Set up a domain**. Enter your domain or a subdomain such as `bonsai.example.com` and follow Cloudflare's DNS setup.

You can host this app entirely on Cloudflare without Hostinger. Associate the custom domain with the Pages project before manually adding DNS records. For automatic deployments from a repository, create a project using Git integration instead; a Direct Upload project cannot later be converted to Git integration. With this repository layout, use build root `web`, build command `npm run build`, and output directory `dist`.

Official instructions: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Deploy on Hostinger with Cloudflare DNS

1. Use a Hostinger plan that supports custom website files, and add the domain as a **Custom PHP/HTML website** in hPanel.
2. Upload the **contents** of `dist/` into the website's `public_html` directory using File Manager or SFTP. `index.html` belongs directly in `public_html`, not `public_html/dist`. Alternatively upload the prepared ZIP and extract it there.
3. In Cloudflare DNS, point the chosen hostname's **A** record to the hosting IP supplied by Hostinger. Configure `www` if you want to use it too. Keep Cloudflare as your DNS provider; changing nameservers is unnecessary.
4. Enable HTTPS for the hostname on Hostinger.

No Node server, PHP code, database, or environment variables are needed on the host. Relative asset paths also support a subdirectory such as `public_html/bonsai/`.

Official instructions: [Upload a custom website](https://www.hostinger.com/support/how-to-upload-a-website-from-backups/), [Manage Cloudflare DNS](https://www.hostinger.com/support/4410549-how-to-manage-the-dns-zone-at-cloudflare/).

## Using Bonsai

- Use **New blank tree** to start with an empty pot, choose a name and species, and add a root value. Select miniature potted trees on the wooden shelves of the **Bonsai bench**, rename the active tree in the title, or remove a tree from the saved bench. Each silhouette reflects its JSON branches and species. Import several JSON files, or drop them anywhere. Invalid files show an error; valid files in the same batch still load.
- Each tree retains its pruning, expansion, selection, graph camera, and dragged node/pot positions. The bench automatically saves after changes and restores after reload. Undo/redo history lasts for the current session. Each species has a distinct growth algorithm: elm uses a winding leader and alternating shoots; maple opens elliptical fans; pine builds an apex with staggered pads; juniper follows a sweeping wind field; ficus spreads into boughs and hanging aerial branches. Changing species retrains the whole visible crown while keeping the root, pot, camera, and JSON intact. Each species also colors the tree, list controls, and bench icon: elm green, maple burgundy, pine evergreen, juniper blue-green, and ficus olive. Manual placement remains available.
- Expand/collapse changes only the view. Inclusion switches prune branches and their descendants from the output.
- The live preview, copy, and export all use the pruned JSON. Export downloads `filename.pruned.json`; original files stay unchanged.
- Use the arrow in the JSON preview header to collapse or reopen it. Collapsing gives the graph more space on desktop and folds the preview below the graph on mobile.
- Hover a branch to reveal a plus button that adds a child to its parent object or array. Null nodes also have add-child controls: adding a named child converts the null into an object, including at the root or inside arrays. Undo restores the original null. Node controls also delete a node with its descendants. New values accept JSON; object keys must be unique.
- Every JSON node can be deleted, including the root. Delete all clears the tree; Add root node starts it again. Empty trees disable copy and export. Undo/redo covers additions, deletions, clearing, and pruning; Restore all restores excluded branches. Use Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+S for undo, redo, and export. Delete or Backspace removes a focused node.
- Search includes keys and primitive values, with matching ancestors visible even inside collapsed branches.
- Drag a node to carry its descendants on flexible joints. Children bend around nearby cards instead of blocking their parent. Neighbors can yield, with springs drawing them home and restoring the preferred branch spacing as space clears. Continuous collision sweeps keep cards apart on fast drags. The pot stays an independent obstacle. Moving branches changes placement; JSON relationships stay intact. Drag the background to pan. Scroll, pinch, or use controls to zoom. Arrow keys move a focused branch or pan the focused canvas; the canvas also supports `+`, `-`, and `0` to fit.
- Expanding and collapsing gently reflows neighboring subtrees around the root, preserving their parent-relative arrangement and avoiding overlapping cards. Folding gives the space back. The camera stays fixed, cards stay mounted, and branches settle with a small sway. Reduced-motion preferences skip animations. Use Fit to bring a spread-out tree into view.
- Connecting limbs share a stout stem, taper toward their tips, and grow thicker near the root and larger subtrees.
- The glazed ceramic pot and root can be dragged independently, with a connecting trunk that follows both. Moving the root carries its JSON descendants and leaves the pot fixed. Cards get slightly smaller at each level above it, stopping at 82% size to keep deep branches readable. Fit includes the pot, and limbs stay attached to the scaled cards.
- Collision checks run throughout animation and reserve space for card sway and the pot. Opening cards appear once their destination is clear; closing cards fade in place before releasing their space.

The graph uses native SVG text and shapes; zoom changes the SVG `viewBox`. The dot grid shares the world coordinates of the tree and follows panning and zooming. It does not enlarge a cached HTML layer with CSS transforms, so nodes redraw at the current display resolution.

Bench miniatures use saved node positions, with a representative overview of large trees and independently fitted axes so wide canopies retain their height. All wood renders behind all foliage, with the pot front covering the base of the trunk. Species change trunk thickness, taper, curves, bark, and grain in both the editor and the miniature, from slender maple wood to stout ficus trunks. Growth patterns use stable JSON paths so repeated style changes and reloads preserve the same character.

The root stays included until deleted. Pruned or deleted array items are removed and remaining items reindexed, preserving their node identities. All JSON root types are supported, including primitives and null. Limits: 10 MB, 25,000 nodes, and 200 nested levels per file. Numbers follow JavaScript JSON semantics.

The bench is saved to localStorage on this browser and device. A first-party cookie remembers the selected tree for up to a year; full tree data stays in browser storage. Storage failures show a warning; export your trees if storage is full or blocked. Clearing browser data removes your bench. Export JSON for backups or use on another device. Unreadable saved benches are preserved rather than overwritten. Google Fonts are optional external styling resources; system fonts are the fallback.

## Source

- `src/App.jsx`: React workspace, Bonsai bench, import/export, and list view.
- `src/workspace.js`: blank-tree creation, bench serialization, browser saving, and restoration.
- `src/species.js`: species presets and their automatic branch preferences.
- `src/components/TreeCanvas.jsx`: SVG graph, accessible controls, camera, and pointer input.
- `src/components/JsonPreview.jsx`: syntax coloring rendered as React text nodes.
- `src/core.js`: parsing, pruning, undo/redo, filtering, and tree layout.
- `src/camera.js`: zoom calculations and SVG viewport projection.
- `src/graph.js`: subtree packing, parent-relative placement, collision avoidance, tapered trunk geometry, and graph bounds.
- `src/collisions.js`: spatial collision indexing and continuous sweeps for dragging and animation.
- `src/elastic.js`: flexible branch joints, yielding neighbors, and return springs during manual movement.
- `src/components/BenchTree.jsx`: miniature potted silhouettes on the wooden bench.
- `src/growth.js`: five species-specific growth algorithms and deterministic branch preferences.
- `src/miniature.js`: sampled overview layout that preserves relative node placement.
- `tests/`: pruning, document isolation, data safety, and camera regression tests.
- `vite.config.js`: React build with portable, relative asset paths.
