import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const build = resolve(project, 'dist');
const output = resolve(project, '.cloudflare', 'assets');
const next = resolve(project, '.cloudflare', 'assets-next');

// Validate absolute staging paths before any recursive cleanup, on every OS.
const stagingRoot = resolve(project, '.cloudflare') + sep;
for (const path of [output, next]) {
  if (!path.startsWith(stagingRoot) || path === stagingRoot.slice(0, -1)) throw new Error('Unsafe staging directory');
}
if (!(await stat(resolve(build, 'index.html')).catch(() => null))?.isFile()) throw new Error('Build missing: run npm run build first.');

await rm(next, { recursive: true, force: true });
await mkdir(resolve(next, 'bonsai'), { recursive: true });
for (const entry of await readdir(build, { withFileTypes: true })) {
  // Hosting metadata is not part of the public application.
  if (entry.name.startsWith('.')) continue;
  await cp(resolve(build, entry.name), resolve(next, 'bonsai', entry.name), { recursive: true });
}
async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(resolve(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

// Preserve watched directories: Windows prevents replacing a directory while
// wrangler dev holds it open. Copy updates, then remove only stale files.
await mkdir(output, { recursive: true });
await cp(next, output, { recursive: true, force: true });
const currentFiles = new Set(await filesIn(next));
for (const file of await filesIn(output)) {
  if (!currentFiles.has(file)) await rm(resolve(output, file), { force: true });
}
await rm(next, { recursive: true, force: true });
console.log('Prepared static assets at .cloudflare/assets/bonsai/ for /bonsai.');
