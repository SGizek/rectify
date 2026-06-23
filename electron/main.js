const { app, BrowserWindow } = require("electron");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
    },
  });

  win.loadURL("https://rectify-lemon.vercel.app");
  win.setMenuBarVisibility(false);
});

app.on("window-all-closed", () => app.quit());
