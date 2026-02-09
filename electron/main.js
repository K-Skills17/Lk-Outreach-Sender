const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;

function getStandalonePaths() {
  const isPackaged = app.isPackaged && process.resourcesPath;
  if (isPackaged) {
    const nodeExe = path.join(process.resourcesPath, 'node', 'node.exe');
    const standaloneDir = path.join(process.resourcesPath, 'standalone');
    return { nodeExe, standaloneDir, useBundledNode: true };
  }
  const projectRoot = path.join(__dirname, '..');
  const standaloneDir = path.join(projectRoot, '.next', 'standalone');
  return { nodeExe: 'node', standaloneDir, useBundledNode: false };
}

/** Load KEY=value from .env file and merge into env (so packaged app has Supabase URL/key). */
function loadEnvFromFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return {};
  const env = {};
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const { nodeExe, standaloneDir, useBundledNode } = getStandalonePaths();

    if (!fs.existsSync(standaloneDir) || !fs.existsSync(path.join(standaloneDir, 'server.js'))) {
      reject(new Error('Standalone server not found. Run "npm run build" first.'));
      return;
    }

    const envFile = path.join(standaloneDir, '.env');
    const envLocal = path.join(__dirname, '..', '.env.local');
    const envFromFile = loadEnvFromFile(fs.existsSync(envFile) ? envFile : envLocal);
    const env = { ...process.env, ...envFromFile, PORT: String(PORT) };
    const opts = { cwd: standaloneDir, env, stdio: 'pipe' };

    serverProcess = spawn(nodeExe, ['server.js'], opts);

    serverProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('Ready')) console.error('[Next]', msg.trim());
    });

    serverProcess.on('error', (err) => reject(err));
    serverProcess.on('exit', (code) => {
      serverProcess = null;
      if (code !== 0 && code !== null) console.error('Server exited with code', code);
    });

    const check = () => {
      const http = require('http');
      const req = http.get(`${BASE}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        setTimeout(check, 200);
      });
      req.on('error', () => setTimeout(check, 200));
      req.setTimeout(500, () => { req.destroy(); setTimeout(check, 200); });
    };

    setTimeout(check, 500);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'LK Outreach Sender',
  });

  win.loadURL(BASE);
  win.on('closed', () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

app.whenReady().then(() => {
  startServer()
    .then(createWindow)
    .catch((err) => {
      console.error(err.message);
      app.exit(1);
    });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});
