const { app, BrowserWindow, screen, Tray, Menu, ipcMain, session, desktopCapturer, nativeImage } = require('electron');
const path = require('node:path');
const http = require('node:http');

// Enable hardware transparent visuals on Windows
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-gpu-vsync');

let mainWindow = null;
let tray = null;
let currentMode = 'full'; // 'full' or 'mini'
let isQuitting = false;

function getFullWindowSize(display = screen.getPrimaryDisplay()) {
  const { width, height } = display.workAreaSize;
  return {
    width: Math.max(900, Math.min(1280, width - 32)),
    height: Math.max(680, Math.min(900, height - 32)),
  };
}

function getAppIconPath(size = 'app') {
  const filename = size === 'tray' ? 'koko-tray.png' : 'koko-app-icon.png';
  const assetRoot = app.isPackaged ? '../dist/assets/icons' : '../public/assets/icons';
  return path.join(__dirname, assetRoot, filename);
}

function waitForServer(url, timeoutMs = 15000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    function check() {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    }

    function retry() {
      if (Date.now() - startTime > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, 300);
      }
    }

    check();
  });
}

async function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const fullWindowSize = getFullWindowSize(primaryDisplay);

  mainWindow = new BrowserWindow({
    width: fullWindowSize.width,
    height: fullWindowSize.height,
    minWidth: 900,
    minHeight: 680,
    center: true,
    icon: getAppIconPath(),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  const devServerUrl = 'http://localhost:5174/';
  const isDevReady = !app.isPackaged && await waitForServer(devServerUrl);

  if (!app.isPackaged && isDevReady) {
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexPath);
  }

  createTray();

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showWindow(mode = 'full', action = null) {
  if (!mainWindow) return;
  mainWindow.show();
  setWindowMode(mode);
  mainWindow.focus();
  if (action) {
    mainWindow.webContents.send('tray-action', action);
  }
}

function setWindowMode(mode) {
  if (!mainWindow) return;
  currentMode = mode;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  if (mode === 'mini') {
    // Mini Floating Companion Mode (100% transparent at bottom-right)
    mainWindow.setResizable(true);
    mainWindow.setSize(300, 440, true);
    mainWindow.setPosition(screenW - 320, screenH - 460, true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setResizable(false);
  } else {
    // Full Companion Window Mode (centered desktop app)
    const fullWindowSize = getFullWindowSize(primaryDisplay);
    mainWindow.setResizable(true);
    mainWindow.setSize(fullWindowSize.width, fullWindowSize.height, true);
    mainWindow.center();
    mainWindow.setAlwaysOnTop(false);
  }

  mainWindow.webContents.send('window-mode-change', mode);
}

function createTray() {
  if (tray) return;
  try {
    const trayIcon = nativeImage.createFromPath(getAppIconPath('tray')).resize({ width: 32, height: 32 });
    tray = new Tray(trayIcon);
  } catch {}

  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '可可 · AI 桌面陪伴伴侣',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '完整伴侣工作台',
        click: () => showWindow('full'),
      },
      {
        label: '悬浮陪伴小窗',
        click: () => showWindow('mini'),
      },
      { type: 'separator' },
      { label: '📌 打开便签', click: () => showWindow('full', 'sticky') },
      { label: '🍅 开始专注', click: () => showWindow('full', 'focus') },
      { label: '💧 作息与喝水', click: () => showWindow('full', 'life') },
      { label: '⚙ 打开设置', click: () => showWindow('full', 'settings') },
      { type: 'separator' },
      {
        label: '退出可可陪伴',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip('可可 · 桌面陪伴伴侣');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) mainWindow.focus();
        else showWindow(currentMode);
      }
    });
  }
}

// IPC Handlers
ipcMain.on('window-mode-switch', (event, mode) => {
  setWindowMode(mode);
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

// Hardware-level screen capture handler for Electron
ipcMain.handle('desktop-capture-frame', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 640, height: 360 },
    });
    if (sources && sources.length > 0 && sources[0].thumbnail) {
      return sources[0].thumbnail.toDataURL();
    }
  } catch (err) {
    console.error('Screen capture error:', err);
  }
  return null;
});

app.whenReady().then(() => {
  // Support getDisplayMedia in Electron without prompt
  if (session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        callback({ video: sources[0] });
      }).catch(() => {
        callback({});
      });
    });
  }
  createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    app.quit();
  }
});
