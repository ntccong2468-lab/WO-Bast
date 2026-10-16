import { createRequire } from 'node:module';
import { mkdir, cp, readFile, writeFile, rename, rm, stat, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url),
  electronRequire = createRequire(require.resolve('electron/package.json'));
const { downloadArtifact } = electronRequire('@electron/get');
const { extract } = electronRequire('@electron-internal/extract-zip');
const electronPackage = electronRequire('./package.json');
const checksums = electronRequire('./checksums.json');
const project = resolve(import.meta.dirname, '..');
const output = resolve(process.env.VN_POCHTA_ARTIFACT_DIR ?? join(project, 'release'));
const name = 'VN-Pochta-win32-x64';
const destination = join(output, name),
  stage = join(destination, 'resources', 'app');
async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_cache: process.env.npm_config_cache ?? '/tmp/vn-pochta-package-npm',
      },
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
await mkdir(output, { recursive: true });
// Only the dedicated generated app directory is replaced; source/userData are never included.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const zip = await downloadArtifact({
  version: electronPackage.version,
  artifactName: 'electron',
  platform: 'win32',
  arch: 'x64',
  checksums,
  cacheRoot: process.env.ELECTRON_CACHE,
});
await extract(zip, { dir: destination });
await rename(join(destination, 'electron.exe'), join(destination, 'VN-Pochta.exe'));
await mkdir(stage, { recursive: true });
for (const file of ['package.json', 'package-lock.json'])
  await cp(join(project, file), join(stage, file));
await cp(join(project, 'dist'), join(stage, 'dist'), { recursive: true });
await run(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  [
    'ci',
    `--cache=${process.env.npm_config_cache ?? '/tmp/vn-pochta-package-npm'}`,
    '--omit=dev',
    '--os=win32',
    '--cpu=x64',
    '--ignore-scripts',
  ],
  stage,
);
const nativeFiles = [
  'VN-Pochta.exe',
  'resources/app/node_modules/@img/sharp-win32-x64/lib/' +
    (await readdir(join(stage, 'node_modules/@img/sharp-win32-x64/lib'))).find((name) =>
      name.endsWith('.node'),
    ),
  'resources/app/node_modules/better-sqlite3/prebuilds/win32-x64.node',
];
for (const file of nativeFiles) {
  const bytes = await readFile(join(destination, file));
  if (bytes.subarray(0, 2).toString() !== 'MZ')
    throw new Error(`Expected Windows PE binary: ${file}`);
}
const readme =
  'VN ПОЧТА — Windows x64\r\n\r\n1. Extract the entire ZIP to a writable folder.\r\n2. Run VN-Pochta.exe (no Node.js installation needed).\r\n3. Open Cấu hình; enter your OpenAI API key and click Lưu khóa an toàn.\r\n4. Check connection, then open AI Studio, select source images and a prompt, preview and confirm generation.\r\n\r\nAPI generation/auditing may incur charges. Marketplace publishing is not implemented.\r\nThis build is unsigned and has been packaged on Linux; Windows runtime/API validation is deferred to the user.\r\nData and encrypted local keys are stored in the operating system userData directory, not this folder.\r\n';
await writeFile(join(destination, 'READ-ME-FIRST.txt'), readme, 'utf8');
await cp(join(project, 'README.md'), join(destination, 'DEVELOPMENT-README.md'));
const archive = join(output, name + '.zip');
await run(
  'python3',
  [
    '-c',
    'import shutil,sys; shutil.make_archive(sys.argv[1],"zip",root_dir=sys.argv[2],base_dir=sys.argv[3])',
    archive.slice(0, -4),
    output,
    name,
  ],
  project,
);
const digest = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await writeFile(archive + '.sha256', digest + '  ' + name + '.zip\n');
console.log(JSON.stringify({ archive, bytes: (await stat(archive)).size, sha256: digest }));
