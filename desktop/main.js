const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const SERVERS = ['frankfurt', 'singapore', 'losangeles', 'warsaw'];

function getConfigsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'configs');
  }
  return path.join(__dirname, 'configs');
}

function findWireGuardExe() {
  const candidates = [
    'C:\\Program Files\\WireGuard\\wireguard.exe',
    'C:\\Program Files (x86)\\WireGuard\\wireguard.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'wireguard.exe'; // fallback to PATH
}

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function getActiveTunnel() {
  const { stdout } = await run('sc query type= service state= all');
  for (const name of SERVERS) {
    const marker = `WireGuardTunnel$${name}`;
    const idx = stdout.indexOf(marker);
    if (idx !== -1) {
      const chunk = stdout.substring(idx, idx + 300);
      if (chunk.includes('RUNNING')) {
        return name;
      }
    }
  }
  return null;
}

async function disconnectServer(name) {
  const exe = findWireGuardExe();
  await run(`"${exe}" /uninstalltunnelservice ${name}`);
}

async function connectServer(name) {
  const exe = findWireGuardExe();
  const configsDir = getConfigsDir();
  const confPath = path.join(configsDir, `${name}.conf`);

  // Disconnect any other active tunnel first
  const active = await getActiveTunnel();
  if (active && active !== name) {
    await disconnectServer(active);
  }
  if (active === name) {
    await disconnectServer(name);
    return { connected: false, server: name };
  }

  const result = await run(`"${exe}" /installtunnelservice "${confPath}"`);
  return { connected: !result.error, server: name, error: result.error ? result.stderr : null };
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('vpn:status', async () => {
  const active = await getActiveTunnel();
  return { active };
});

ipcMain.handle('vpn:toggle', async (event, serverName) => {
  try {
    const res = await connectServer(serverName);
    return res;
  } catch (e) {
    return { connected: false, server: serverName, error: String(e) };
  }
});
