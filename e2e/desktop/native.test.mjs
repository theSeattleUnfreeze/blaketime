import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startFixture } from '../../tests/fixtures/knots-rpc.ts';

const endpoint = 'http://127.0.0.1:4445';
async function command(method, path, body) {
  const response = await fetch(endpoint + path, { method, headers: { 'content-type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`WebDriver ${response.status}: ${data.value?.error ?? 'request failed'}`);
  return data.value;
}
async function until(operation, predicate = Boolean, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await operation(); if (predicate(value)) return value; } catch { await delay(100); }
    await delay(150);
  }
  throw new Error('Native test condition timed out');
}

test('standalone native UI, IPC permissions, preferences and node updates', { timeout: 120000 }, async t => {
  const fixture = await startFixture(49193);
  const child = spawn(resolve(`target/debug/blaketime-desktop${process.platform === 'win32' ? '.exe' : ''}`), [], {
    env: { ...process.env, TAURI_WEBDRIVER_PORT: '4445', BLAKETIME_TEST_CONFIG: fixture.config, BLAKETIME_TEST_DATA_DIR: fixture.directory },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', value => { logs = (logs + String(value)).slice(-8000); });
  child.stderr.on('data', value => { logs = (logs + String(value)).slice(-8000); });
  child.on('error', error => { logs += error.message; });
  t.after(async () => {
    child.kill('SIGTERM');
    await until(async () => child.exitCode !== null || child.signalCode !== null, Boolean, 5000).catch(() => child.kill('SIGKILL'));
    await new Promise(resolve => fixture.server.close(resolve));
    await rm(fixture.directory, { recursive: true, force: true });
  });
  await until(() => command('GET', '/status')).catch(error => { throw new Error(`${error.message}\n${logs}`); });
  const session = await command('POST', '/session', { capabilities: { alwaysMatch: {} } });
  const id = session.sessionId;
  assert.ok(id);
  t.after(() => command('DELETE', `/session/${id}`).catch(() => {}));
  const execute = (script, args = []) => command('POST', `/session/${id}/execute/sync`, { script, args });
  const invoke = (name, args = {}) => command('POST', `/session/${id}/execute/async`, {
    script: 'const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({value})).catch(()=>done({denied:true}));', args: [name, args]
  });
  await until(() => execute('return document.querySelector("[data-testid=block-height]")?.textContent'), value => value === '150987');
  const info = await invoke('app_info');
  assert.equal(info.value.desktop, true);
  assert.equal(info.value.updatesEnabled, false);
  const denied = await invoke('plugin:fs|read_file', { path: '/not-an-authorized-file' });
  assert.equal(denied.denied, true);
  const before = await invoke('dashboard');
  assert.equal(before.value.chain.hashrateSampleCount, 120);
  assert.ok(!JSON.stringify(before).includes('test-only:fixture'));
  await invoke('set_automatic_updates', { automatic: false });
  assert.equal((await invoke('update_status')).value.automatic, false);
  await execute('document.querySelector("nav button").click()');
  await until(() => execute('return document.querySelector("dialog")?.open'));
  assert.equal(await execute('return [...document.querySelectorAll("button")].some(b=>b.textContent==="Choose configuration file")'), true);
  assert.equal(await execute('return document.querySelector("dialog").textContent.includes("Updates are unavailable in this development build.")'), true);
  await execute('document.querySelector("dialog button").click()');
  await fetch('http://127.0.0.1:49193/control', { method: 'POST', body: JSON.stringify({ tip: 150988 }) });
  await until(() => execute('return document.querySelector("[data-testid=block-height]")?.textContent'), value => value === '150988');
  await mkdir('test-results/native', { recursive: true });
  const screenshot = await command('GET', `/session/${id}/screenshot`);
  await writeFile('test-results/native/dashboard.png', Buffer.from(screenshot, 'base64'));
});
