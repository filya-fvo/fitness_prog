import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Exercise the real distribution config with an isolated, disposable Nginx.
const config = fileURLToPath(new URL('../nginx.conf', import.meta.url));
const container = `filfit-apk-test-${randomUUID()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
const hashes = { 8: 'a'.repeat(64), 9: 'b'.repeat(64) };
const paths = Object.fromEntries([8, 9].map(version => [version, `/android/releases/${version}-${hashes[version]}/FilFit.apk`]));
let started = false;
try {
  docker('run', '--detach', '--name', container, '--publish', '127.0.0.1::80',
    '--mount', `type=bind,source=${config},target=/etc/nginx/conf.d/default.conf,readonly`, 'nginx:1.28-alpine');
  started = true;
  docker('exec', container, 'sh', '-ec', `
    cd /usr/share/nginx/html
    mkdir -p android/releases/8-${hashes[8]} android/releases/9-${hashes[9]}
    printf 'APK8-synthetic-payload' > android/releases/8-${hashes[8]}/FilFit.apk
    printf 'APK9-synthetic-payload' > android/releases/9-${hashes[9]}/FilFit.apk
    printf '{"versionCode":8}' > android/releases/8-${hashes[8]}/latest.json
    printf '{"versionCode":9}' > android/releases/9-${hashes[9]}/latest.json
    ln -s releases/8-${hashes[8]} android/current
    ln -s current/FilFit.apk android/latest.apk
    ln -s current/latest.json android/latest.json
  `);
  const port = docker('port', container, '80/tcp').split(':').at(-1);
  const origin = `http://127.0.0.1:${port}`;
  const download = async (path, version, latest = false) => {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'application/vnd.android.package-archive');
    assert.equal(response.headers.get('content-disposition'), `attachment; filename="filfit_build${version}.apk"`);
    assert.match(response.headers.get('cache-control'), latest ? /no-store/ : /immutable/);
    assert.equal(await response.text(), `APK${version}-synthetic-payload`);
    return response;
  };
  await download('/android/latest.apk', 8, true);
  await download(paths[8], 8);
  const partial = await fetch(origin + '/android/latest.apk', { headers: { Range: 'bytes=0-3' } });
  assert.equal(partial.status, 206);
  assert.equal(await partial.text(), 'APK8');
  docker('exec', container, 'sh', '-ec', `cd /usr/share/nginx/html/android; ln -s releases/9-${hashes[9]} current-next; mv -Tf current-next current`);
  // Release activation must change the filename without Nginx reload.
  await download('/android/latest.apk', 9, true);
  await download(paths[9], 9);
  await download(paths[8], 8);
  const manifest = await fetch(origin + '/android/latest.json');
  assert.equal(manifest.headers.get('content-disposition'), null);
  assert.equal((await manifest.json()).versionCode, 9);
  assert.equal((await fetch(origin + '/android/missing.apk')).status, 404);
  assert.equal((await fetch(origin + '/android/releases/8-' + hashes[8] + '/missing.apk')).status, 404);
  docker('exec', container, 'rm', '/usr/share/nginx/html/android/current');
  assert.equal((await fetch(origin + '/android/latest.apk')).status, 404);
  console.log('Nginx APK checks passed: unique names, atomic switch, immutable history, Range and missing files.');
} finally {
  if (started) docker('rm', '--force', container);
}
