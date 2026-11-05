const {app,BrowserWindow,dialog,ipcMain,Menu} = require('electron');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const registerAgent = require('./agent/ipc.cjs');
const { createSettingsStore } = require('./agent/settings.cjs');

registerAgent(ipcMain, (sender) => {
    const url = new URL(sender.getURL());
    return process.argv[2] === 'dev' ? url.origin === 'http://localhost:3000'
        : url.protocol === 'file:' && url.pathname === new URL(pathToFileURL(path.join(__dirname, 'build/index.html')).href).pathname;
}, createSettingsStore(path.join(app.getPath('userData'), 'session-agent.json')));

const windows = {
  windowIndex: 0,
  mainWindow: null, //主窗口
  subWindow: null, //主窗口
}


let serverProcess = null;
let isQuitting = false;

function stopTsharkServer() {
    if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;
    if (process.platform === 'win32') {
        const result = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
            ['/PID', String(serverProcess.pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true,
                timeout: 5000
            });
        if (result.error || result.status !== 0) serverProcess.kill();
    } else {
        serverProcess.kill();
    }
}

app.on('before-quit', () => {
    if (isQuitting) return;
    isQuitting = true;
    stopTsharkServer();
});

function createWindow()
{
    windows.mainWindow = new BrowserWindow({
        width:1200,
        height:900,
        title:'EasyTshark',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })
    Menu.setApplicationMenu(null);
    windows.mainWindow.on('closed', () => {
        windows.mainWindow = null;
        if (!isQuitting) app.quit();
    });
    
    const mode = process.argv[2];
    if(mode === 'dev'){
        windows.mainWindow.loadURL("http://localhost:3000/#/data/dataPacket/all");
        windows.mainWindow.webContents.openDevTools();
    }else{
        windows.mainWindow.loadURL(`file://${path.join(__dirname, 'build/index.html')}#/`);
    }
    
}

function startTsharkServer() {
    if (process.argv[2] === 'dev') return;
    const resourceDir = path.join(process.resourcesPath, 'resources');
    const candidates = process.platform === 'win32'
        ? ['tshark_server_helper.exe', 'tshark_server.exe']
        : ['tshark_server_helper', 'tshark_server'];
    const serverPath = candidates
        .map((name) => path.join(resourceDir, name))
        .find((filePath) => fs.existsSync(filePath));
    if (!serverPath) return;
    serverProcess = spawn(serverPath, [`--uipid=${process.pid}`], {
        env: {
            ...process.env,
            ...(app.isPackaged ? { EASYTSHARK_DATA_DIR: path.dirname(app.getPath('exe')) } : {})
        },
        detached: false,
        stdio: 'ignore',
        windowsHide: true
    });
    serverProcess.on('error', (error) => {
        console.error('Failed to start EasyTshark backend:', error);
        serverProcess = null;
        app.quit();
    });
}

ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(windows.mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Capture files', extensions: ['pcap', 'pcapng', 'cap'] },
            { name: 'All files', extensions: ['*'] }
        ]
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('show-save-dialog', async (_, directory) => {
    const result = await dialog.showSaveDialog(windows.mainWindow, {
        title: '保存文件',
        defaultPath: typeof directory === 'string' && directory ? path.join(directory, 'capture.pcap') : 'capture.pcap',
        filters: [
            { name: 'Capture files', extensions: ['pcap'] },
            { name: 'All files', extensions: ['*'] }
        ]
    });
    return result.canceled ? null : result.filePath;
});

ipcMain.handle('select-settings-path', async (_, field, currentPath) => {
    const titles = {
        tsharkPath: '选择 tshark.exe',
        editcapPath: '选择 editcap.exe',
        pcapDirectory: '选择抓包保存目录',
        tlsKeyLogPath: '选择 TLS 密钥日志文件'
    };
    if (!Object.prototype.hasOwnProperty.call(titles, field)) throw new Error('不支持的配置项');
    const options = {
        title: titles[field],
        defaultPath: typeof currentPath === 'string' && currentPath ? currentPath : undefined
    };
    if (field === 'tlsKeyLogPath') {
        const result = await dialog.showOpenDialog(windows.mainWindow, {
            ...options, buttonLabel: '打开', properties: ['openFile'],
            filters: [{ name: '密钥日志文件', extensions: ['log', 'txt', 'keys'] }, { name: '所有文件', extensions: ['*'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    }
    const result = await dialog.showOpenDialog(windows.mainWindow, {
        ...options,
        properties: field === 'pcapDirectory' ? ['openDirectory', 'createDirectory'] : ['openFile'],
        filters: field === 'pcapDirectory' ? [] : [{ name: 'Executables', extensions: ['exe'] }]
    });
    return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(()=>{
    startTsharkServer();
    createWindow();
});
app.on('web-contents-created',function(event,webContents){

    //监听window.open事件
    webContents.setWindowOpenHandler((details)=>{
        //获取要打开的URL
        const {url} = details;
        const params = url.split('?')[1];
        const browserWindow = new BrowserWindow({
          width: 1000,
          height: 800,
          title: 'EasyTshark',
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
          }
        });

        if (windows.windowIndex === 0) {
          windows.subWindow = browserWindow;
        } else {
          windows[`subWindow${windows.windowIndex}`] = browserWindow;
        }

        Menu.setApplicationMenu(null);

        //加载URL
        const mode = process.argv[2];
        if(mode === 'dev'){
            browserWindow.loadURL(`http://localhost:3000/#/detail?${params}`);
            browserWindow.webContents.openDevTools();
        }else{
            browserWindow.loadURL(`file://${path.join(__dirname, 'build/index.html')}#/detail?${params}`);
        }

        windows.windowIndex = windows.windowIndex + 1;

        return { action: 'deny' };
    })
})

app.on('window-all-closed',()=>{
    if(!isQuitting && process.platform !== 'darwin'){
        app.quit();
    }
})
