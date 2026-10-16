import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.platform !== 'linux') throw new Error('Use npm run test:e2e on Windows/macOS.');
const executable = existsSync('/usr/bin/Xvfb')
  ? '/usr/bin/Xvfb'
  : '/workspace/.vn-pochta-tools/xvfb/usr/bin/Xvfb';
if (!existsSync(executable)) throw new Error('Run bash scripts/setup-cloud.sh to prepare Xvfb.');
const local = mkdtempSync(join(tmpdir(), 'pochta-runtime-'));
const xvfb = spawn(
  executable,
  ['-displayfd', '1', '-screen', '0', '1440x1000x24', '-nolisten', 'tcp'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
try {
  const display = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Xvfb did not become ready')), 10000);
    xvfb.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    xvfb.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Xvfb exited ${code}`));
    });
    xvfb.stdout.on('data', (chunk) => {
      output += chunk;
      if (/^\d+\n/.test(output)) {
        clearTimeout(timer);
        resolve(`:${output.trim()}`);
      }
    });
    xvfb.stderr.on('data', (chunk) => process.stderr.write(chunk));
  });
  const child = spawn('npm', ['run', 'test:e2e'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DISPLAY: display,
      VN_POCHTA_TEST_NO_SANDBOX: '1',
      XDG_CONFIG_HOME: join(local, 'config'),
      XDG_CACHE_HOME: join(local, 'cache'),
    },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', reject);
  });
} finally {
  xvfb.kill();
  rmSync(local, { recursive: true, force: true });
}
