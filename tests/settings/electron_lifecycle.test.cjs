const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadApplication({ dev = false, platform = 'win32', backendExists = true, taskkillStatus = 0 } = {}) {
  const app = new EventEmitter();
  const backend = new EventEmitter();
  Object.assign(backend, { pid: 4321, exitCode: null, signalCode: null });
  const spawned = [];
  const terminated = [];
  const windows = [];
  let killed = 0;
  let quits = 0;
  let ready;
  backend.kill = () => { killed += 1; };
  app.getPath = () => 'D:\EasyTshark\EasyTshark.exe';
  app.isPackaged = true;
  app.whenReady = () => ({ then(callback) { ready = callback; } });
  app.quit = () => { quits += 1; app.emit('before-quit'); };
  class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      this.webContents = { openDevTools() {} };
      windows.push(this);
    }
    loadURL() {}
  }
  const electron = {
    app, BrowserWindow, dialog: {},
    ipcMain: { handle() {} }, Menu: { setApplicationMenu() {} },
  };
  const entry = path.resolve(__dirname, '../../tshark-front/electron.js');
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'child_process') return {
        spawn(...args) { spawned.push(args); return backend; },
        spawnSync(...args) { terminated.push(args); return { status: taskkillStatus }; },
      };
      if (name === 'fs') return { existsSync: () => backendExists };
      if (name === './agent/ipc.cjs') return () => {};
      if (name === './agent/settings.cjs') return { createSettingsStore: () => ({}) };
      return require(name);
    },
    __dirname: path.dirname(entry), console: { error() {} },
    process: {
      argv: dev ? ['electron', '.', 'dev'] : ['electron', '.'],
      platform, pid: 1234, resourcesPath: 'D:\EasyTshark\resources',
      env: { SystemRoot: 'C:\Windows' },
    },
  });
  ready();
  return { app, backend, spawned, terminated, windows, killed: () => killed, quits: () => quits };
}

test('closing main window quits even with detail windows and kills only the owned backend tree', () => {
  const application = loadApplication();
  let openDetail;
  application.app.emit('web-contents-created', {}, {
    setWindowOpenHandler(handler) { openDetail = handler; },
  });
  openDetail({ url: 'file:///detail?id=1' });
  assert.equal(application.windows.length, 2);
  assert.equal(application.spawned[0][1][0], '--uipid=1234');
  assert.equal(application.spawned[0][2].detached, false);
  application.windows[0].emit('closed');
  assert.equal(application.quits(), 1);
  const [command, argumentsList, options] = application.terminated[0];
  assert.equal(command, path.join('C:\Windows', 'System32', 'taskkill.exe'));
  assert.deepEqual(Array.from(argumentsList), ['/PID', '4321', '/T', '/F']);
  assert.equal(options.windowsHide, true);
  assert.equal(options.timeout, 5000);
});

test('all quit paths clean up the backend', () => {
  const application = loadApplication();
  application.app.emit('window-all-closed');
  assert.equal(application.quits(), 1);
  assert.equal(application.terminated.length, 1);
});

test('quitting does not recurse when windows close or terminate the same PID twice', () => {
  const application = loadApplication();
  application.app.quit();
  application.windows[0].emit('closed');
  application.app.emit('window-all-closed');
  application.app.emit('before-quit');
  assert.equal(application.quits(), 1);
  assert.equal(application.terminated.length, 1);
});

test('development and missing-backend launches never terminate external backends', () => {
  for (const options of [{ dev: true }, { backendExists: false }]) {
    const application = loadApplication(options);
    application.app.quit();
    assert.equal(application.spawned.length, 0);
    assert.equal(application.terminated.length, 0);
  }
});

test('an already exited backend is not killed by a potentially reused PID', () => {
  for (const state of [{ exitCode: 0 }, { signalCode: 'SIGTERM' }]) {
    const application = loadApplication();
    Object.assign(application.backend, state);
    application.app.quit();
    assert.equal(application.terminated.length, 0);
    assert.equal(application.killed(), 0);
  }
});

test('taskkill failure falls back to terminating the owned child', () => {
  const application = loadApplication({ taskkillStatus: 1 });
  application.app.quit();
  assert.equal(application.killed(), 1);
});

test('a failed backend launch quits without trying to kill an invalid PID', () => {
  const application = loadApplication();
  application.backend.emit('error', new Error('spawn failed'));
  assert.equal(application.quits(), 1);
  assert.equal(application.terminated.length, 0);
});

test('non-Windows quit terminates its owned backend without taskkill', () => {
  const application = loadApplication({ platform: 'linux' });
  application.app.quit();
  assert.equal(application.killed(), 1);
  assert.equal(application.terminated.length, 0);
});
