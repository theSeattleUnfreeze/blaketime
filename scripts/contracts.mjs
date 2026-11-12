import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const result = spawnSync('cargo', ['run', '--quiet', '--locked', '-p', 'blaketime-core', '--bin', 'export_types'], { encoding: 'utf8' });
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status ?? 1); }
const path = new URL('../packages/contracts/src/generated.ts', import.meta.url);
if (process.argv.includes('--write')) {
  await mkdir(new URL('./', path), { recursive: true });
  await writeFile(path, result.stdout);
} else if (await readFile(path, 'utf8').catch(() => '') !== result.stdout) {
  process.stderr.write('Generated contracts differ; run npm run types:generate.\n');
  process.exit(1);
}
