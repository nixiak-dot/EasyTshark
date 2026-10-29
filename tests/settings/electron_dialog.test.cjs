const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadDialog(result) {
  const handlers = new Map();
  const calls = [];
  const electron = {
    app: { whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: {
      showOpenDialog: async (window, options) => {
        calls.push(options);
        return result;
      },
      showSaveDialog: async () => { throw new Error('Settings must not open a save dialog'); },
    },
  };
  const entry = path.resolve(__dirname, '../../tshark-front/electron.js');
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
    require: name => name === 'electron' ? electron : require(name),
    __dirname: path.dirname(entry), process,
  });
  return { select: handlers.get('select-settings-path'), calls };
}

test('TLS key log selects an existing file using Open, never Save', async () => {
  const selected = 'D:\\密钥 日志\\sslkeys.log';
  const { select, calls } = loadDialog({ canceled: false, filePaths: [selected] });
  assert.equal(await select(null, 'tlsKeyLogPath', selected), selected);
  assert.equal(calls[0].buttonLabel, '打开');
  assert.deepEqual(Array.from(calls[0].properties), ['openFile']);
  assert.equal(calls[0].defaultPath, selected);
  assert.equal(calls[0].title, '选择 TLS 密钥日志文件');
});

test('canceling key selection returns null', async () => {
  const { select } = loadDialog({ canceled: true, filePaths: [] });
  assert.equal(await select(null, 'tlsKeyLogPath', ''), null);
});

test('directory and executable pickers retain their behavior', async () => {
  const { select, calls } = loadDialog({ canceled: false, filePaths: ['D:\\captures'] });
  await select(null, 'pcapDirectory', 'D:\\captures');
  await select(null, 'tsharkPath', 'D:\\Wireshark\\tshark.exe');
  assert.deepEqual(Array.from(calls[0].properties), ['openDirectory', 'createDirectory']);
  assert.deepEqual(Array.from(calls[1].properties), ['openFile']);
  await assert.rejects(select(null, 'unknown', ''), /不支持的配置项/);
});
