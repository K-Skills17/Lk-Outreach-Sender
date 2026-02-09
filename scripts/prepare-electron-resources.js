/**
 * Prepares resources for Electron packaging:
 * 1. Copy .next/static into .next/standalone/.next/static (required by Next standalone)
 * 2. Copy standalone folder and node executable to electron-resources for electron-builder
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const standaloneDir = path.join(projectRoot, '.next', 'standalone');
const staticDir = path.join(projectRoot, '.next', 'static');
const destStatic = path.join(standaloneDir, '.next', 'static');
const resourcesDir = path.join(projectRoot, 'electron-resources');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 1. Copy static into standalone (Next.js requirement)
if (fs.existsSync(staticDir)) {
  fs.mkdirSync(path.join(standaloneDir, '.next'), { recursive: true });
  copyDir(staticDir, destStatic);
  console.log('Copied .next/static to standalone/.next/static');
}

// 2. Prepare electron-resources for packaging
if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  console.error('Run "npm run build" first.');
  process.exit(1);
}

fs.mkdirSync(resourcesDir, { recursive: true });
const destStandalone = path.join(resourcesDir, 'standalone');
if (fs.existsSync(destStandalone)) fs.rmSync(destStandalone, { recursive: true });
copyDir(standaloneDir, destStandalone);
console.log('Copied standalone to electron-resources/standalone');

// Copy .env.local into standalone so the packaged app has Supabase URL/key at runtime
const envLocal = path.join(projectRoot, '.env.local');
if (fs.existsSync(envLocal)) {
  fs.copyFileSync(envLocal, path.join(destStandalone, '.env'));
  console.log('Copied .env.local to electron-resources/standalone/.env');
} else {
  console.warn('No .env.local found - packaged app may show "URL and Key are required" until you add env.');
}

// 3. Copy Node executable (Windows: node.exe; Unix: node binary)
const nodeDir = path.join(resourcesDir, 'node');
fs.mkdirSync(nodeDir, { recursive: true });
const nodeExe = process.execPath; // path to node (or node.exe on Windows)
const nodeDest = path.join(nodeDir, path.basename(nodeExe));
fs.copyFileSync(nodeExe, nodeDest);
console.log('Copied Node to electron-resources/node');

// On Windows, node might need additional DLLs (e.g. from same dir as node.exe) - optional
const nodeDirSrc = path.dirname(nodeExe);
if (process.platform === 'win32') {
  const dlls = ['node.exe']; // node.exe is enough for basic use
  for (const f of fs.readdirSync(nodeDirSrc)) {
    if (f.endsWith('.dll')) {
      try {
        fs.copyFileSync(path.join(nodeDirSrc, f), path.join(nodeDir, f));
      } catch (_) {}
    }
  }
}

console.log('Electron resources ready.');
