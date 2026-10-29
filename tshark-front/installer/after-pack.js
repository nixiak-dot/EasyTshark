const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const files = [];
  const directories = [];
  async function collect(relativeDirectory) {
    const entries = await fs.readdir(path.join(context.appOutDir, relativeDirectory), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await collect(relativePath);
        directories.push(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        throw new Error(`Unsupported installer entry: ${relativePath}`);
      }
    }
  }
  await collect('');
  const elevationHelper = path.join('resources', 'elevate.exe');
  if (!files.includes(elevationHelper)) files.push(elevationHelper);

  const installPath = relativePath => `$INSTDIR\\${relativePath.replace(/\\|\//g, '\\').replace(/\$/g, '$$$$')}`;
  const script = [
    '!macro customRemoveFiles',
    '  SetOutPath $TEMP',
    ...files.map(file => `  Delete "${installPath(file)}"`),
    '  Delete "$INSTDIR\\${UNINSTALL_FILENAME}"',
    '!ifdef UNINSTALLER_ICON',
    '  Delete "$INSTDIR\\uninstallerIcon.ico"',
    '!endif',
    ...directories.map(directory => `  RMDir "${installPath(directory)}"`),
    '  RMDir "$INSTDIR"',
    '!macroend',
    '',
  ].join('\n');
  const buildDirectory = path.join(context.packager.projectDir, 'build');
  await fs.mkdir(buildDirectory, { recursive: true });
  await fs.writeFile(path.join(buildDirectory, 'installer-files.nsh'), script, 'utf8');
};
