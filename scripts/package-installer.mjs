import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.VN_POCHTA_ARTIFACT_DIR ?? join(root, 'release'));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const app = join(output, 'VN-Pochta-win32-x64');
await access(join(app, 'VN-Pochta.exe'));
const installer = join(output, `VN-Pochta-Setup-${version}-x64.exe`);
await new Promise((resolve, reject) => {
  const child = spawn(
    process.env.MAKENSIS ?? 'makensis',
    [
      `-DAPP_DIR=${app}`,
      `-DOUTPUT=${installer}`,
      `-DVERSION=${version}`,
      join(root, 'installer/windows.nsi'),
    ],
    { stdio: 'inherit' },
  );
  child.once('error', reject);
  child.once('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`makensis exited ${code}`)),
  );
});
const digest = createHash('sha256')
  .update(await readFile(installer))
  .digest('hex');
await writeFile(installer + '.sha256', `${digest}  VN-Pochta-Setup-${version}-x64.exe\n`);
console.log(`Installer: ${installer}\nSHA256: ${digest}`);
