const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettingsStore } = require('./settings.cjs');
const { createAgentClient } = require('./client.cjs');

test('settings survive client and store recreation without returning the saved key', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easytshark-settings-'));
  const filePath = path.join(directory, 'config', 'session-agent.json');
  const settings = { baseUrl: 'https://example.com/v1', model: 'fixture' };
  try {
    const first = createAgentClient(createSettingsStore(filePath));
    assert.deepEqual(first.settings(), { baseUrl: '', model: '', hasKey: false });
    first.settings({ ...settings, apiKey: 'local-secret' });
    const second = createAgentClient(createSettingsStore(filePath));
    assert.deepEqual(second.settings(), { ...settings, hasKey: true });
    assert.ok(!JSON.stringify(second.settings()).includes('local-secret'));
    second.settings({ ...settings, model: 'new-model' });
    assert.equal(JSON.parse(fs.readFileSync(filePath)).apiKey, 'local-secret');
    second.settings({ ...settings, apiKey: '' });
    assert.equal(createAgentClient(createSettingsStore(filePath)).settings().hasKey, false);
    assert.throws(() => second.settings({ ...settings, apiKey: 'invalid\nsecret' }), /无效/);
    assert.equal(JSON.parse(fs.readFileSync(filePath)).apiKey, '');
    fs.writeFileSync(filePath, 'invalid SECRET');
    assert.throws(() => second.settings(), /无法读取模型配置文件/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed persistence does not replace the active settings', () => {
  const store = { read: () => null, write() {} };
  const client = createAgentClient(store);
  const settings = { baseUrl: 'https://example.com', model: 'original' };
  client.settings({ ...settings, apiKey: 'secret' });
  store.write = () => { throw new Error('保存失败'); };
  assert.throws(() => client.settings({ ...settings, model: 'changed', apiKey: 'new-secret' }), /保存失败/);
  assert.deepEqual(client.settings(), { ...settings, hasKey: true });
});
