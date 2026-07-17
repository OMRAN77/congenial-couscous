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
  // Query each tunnel service individually. This avoids relying on
  // locale-specific text like "RUNNING" (Arabic Windows shows different
  // wording) — instead we check the numeric STATE code, which is always
  // "4" when a service is running, regardless of system language.
  for (const name of SERVERS) {
    const { error, stdout } = await run(`sc query "WireGuardTunnel$${name}"`);
    if (error) continue; // service not installed / not found
    if (/:\s*4\b/.test(stdout)) {
      return name;
    }
  }
  return null;
}

async function disconnectServer(name) {
  const exe = findWireGuardExe();
  const result = await run(`"${exe}" /uninstalltunnelservice ${name}`);
  // Give Windows a moment to actually stop/remove the service before we
  // re-check its state, otherwise getActiveTunnel() can still report it
  // as running right after this command returns.
  await new Promise((r) => setTimeout(r, 1500));
  return result;
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
    const stillActive = await getActiveTunnel();
    if (stillActive === name) {
      return { connected: true, server: name, error: 'تعذر إيقاف الخدمة. جرّب تشغيل البرنامج كمسؤول (Run as Administrator).' };
    }
    return { connected: false, server: name };
  }

  const result = await run(`"${exe}" /installtunnelservice "${confPath}"`);
  // If WireGuard reports the tunnel is already installed and running,
  // treat that as a successful connection instead of an error.
  const alreadyRunning = result.stderr && /already installed and running/i.test(result.stderr);
  if (alreadyRunning) {
    return { connected: true, server: name, error: null };
  }
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
