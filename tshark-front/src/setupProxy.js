const agentMiddleware = require('../agent/dev-middleware.cjs');
const path = require('node:path');
const os = require('node:os');
const { createSettingsStore } = require('../agent/settings.cjs');

module.exports = function setupProxy(app) {
  const configDirectory = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'EasyTshark');
  app.use('/__session-agent', agentMiddleware(createSettingsStore(path.join(configDirectory, 'session-agent.json'))));
};
