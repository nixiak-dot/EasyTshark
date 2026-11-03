const fs = require('node:fs');
const path = require('node:path');
const { validateSettings } = require('./runtime.cjs');

class SettingsFileError extends Error {}

function createSettingsStore(filePath) {
  return {
    read() {
      try {
        const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const settings = validateSettings(value);
        if (typeof value.apiKey !== 'string' || value.apiKey.length > 4096 || /[\r\n]/.test(value.apiKey)) throw new Error();
        return { ...settings, apiKey: value.apiKey.trim() };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new SettingsFileError('无法读取模型配置文件，请检查文件格式和读取权限。');
      }
    },
    write(value) {
      const temporary = `${filePath}.${process.pid}.tmp`;
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
        fs.renameSync(temporary, filePath);
      } catch {
        throw new SettingsFileError('模型配置保存失败，请检查配置目录的写入权限。');
      } finally {
        try { fs.unlinkSync(temporary); } catch {}
      }
    },
  };
}

module.exports = { createSettingsStore, SettingsFileError };
