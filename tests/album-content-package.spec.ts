import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
test('content apply validates in advance, separates optimized assets, and detects changed content', async ({ page }) => {
  await page.goto('/album-preview.html');
  const exported = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), p = await import('/src/editor/packages.ts'), d = m.newDocument(); d.baseCommit = ''; d.title = '内容包测试';
    const c = document.createElement('canvas'); c.width = 200; c.height = 100; c.getContext('2d')!.fillRect(0, 0, 200, 100);
    const blob = await new Promise<Blob>(resolve => c.toBlob(blob => resolve(blob!), 'image/png')), imported = await p.importImage(new File([blob], '不会公开的原图.png', { type: blob.type }));
    d.assets.push(imported.asset); (d.chapters[0].spreads[0].pages[0].elements[0] as any).assetId = imported.asset.id;
    return await (await p.exportPackage(d, new Map([[imported.asset.id, blob]]), true, await p.contentHash(null))).text();
  });
  const folder = await mkdtemp(join(tmpdir(), 'album-apply-test-'));
  try {
    await mkdir(join(folder, 'src/album'), { recursive: true }); await mkdir(join(folder, 'scripts'));
    await cp('src/album/document.ts', join(folder, 'src/album/document.ts')); await cp('scripts/apply-album.mjs', join(folder, 'scripts/apply-album.mjs'));
    await writeFile(join(folder, 'src/album/published.json'), 'null\n'); await writeFile(join(folder, 'package.json'), '{"type":"module"}');
    execFileSync('git', ['init', '-q'], { cwd: folder }); execFileSync('git', ['add', '.'], { cwd: folder }); execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial'], { cwd: folder });
    const path = join(folder, 'album-content.json'); await writeFile(path, exported);
    const run = (...args: string[]) => spawnSync(process.execPath, [join(folder, 'scripts/apply-album.mjs'), path, ...args], { encoding: 'utf8', cwd: folder });
    const check = run('--check'); expect(check.status, check.stderr).toBe(0); expect(JSON.parse(await readFile(join(folder, 'src/album/published.json'), 'utf8'))).toBe(null);
    const applied = run(); expect(applied.status, applied.stderr).toBe(0);
    const manifest = JSON.parse(await readFile(join(folder, 'src/album/published.json'), 'utf8')); expect(manifest.title).toBe('内容包测试'); expect(manifest.assets[0].mime).toBe('image/webp'); expect(manifest.assets[0].src).toMatch(/^\.\/album\/assets\/[a-f0-9]{64}\.webp$/);
    const image = await readFile(join(folder, 'public', manifest.assets[0].src)); expect(image.toString('ascii', 8, 12)).toBe('WEBP');
    const conflict = run(); expect(conflict.status).toBe(1); expect(conflict.stderr).toContain('网站内容已变化');
    expect(JSON.parse(await readFile(join(folder, 'src/album/published.json'), 'utf8')).title).toBe('内容包测试');
  } finally { await rm(folder, { recursive: true, force: true }); }
});
