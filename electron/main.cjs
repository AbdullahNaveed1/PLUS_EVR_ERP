const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDevelopment = process.env.ELECTRON_START_URL;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.setMenuBarVisibility(false);

  if (isDevelopment) {
    mainWindow.loadURL(isDevelopment);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'ShoeFactoryApi', 'wwwroot', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
