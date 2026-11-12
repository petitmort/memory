#!/usr/bin/env node
// Apply an author-reviewed content package locally. This never builds or publishes.
import { readFile, writeFile, mkdir, rename, mkdtemp, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateDocument } from '../src/album/document.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), file = args.find(arg => !arg.startsWith('--'));
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
try {
  if (!file || args.some(arg => arg.startsWith('--') && arg !== '--check')) throw new Error('用法：project-node scripts/apply-album.mjs /完整路径/album-content.json [--check]');
  const bytes = await readFile(resolve(file)); if (bytes.length > 170 * 1024 * 1024) throw new Error('内容包超过170MB');
  const pack = JSON.parse(bytes.toString('utf8'));
  if (pack.format !== 'tides-album-content' || pack.version !== 1 || !Array.isArray(pack.assets)) throw new Error('需要网站内容包，不能使用可编辑原图备份。');
  const document = validateDocument(pack.document), current = JSON.parse(await readFile(join(root, 'src/album/published.json'), 'utf8'));
  if (pack.baseContentHash !== jsonHash(current)) throw new Error('网站内容已变化，不能覆盖另一端的新内容。请先同步并比较新旧纪念册。');
  if (document.baseCommit) {
    try { execFileSync('git', ['merge-base', '--is-ancestor', document.baseCommit, 'HEAD'], { cwd: root, stdio: 'pipe' }); }
    catch { throw new Error('内容包基线不在当前仓库历史中，请先同步仓库并检查来源。'); }
  }
  for (const options of [[], ['--cached']]) {
    try { execFileSync('git', ['diff', ...options, '--quiet', '--', 'src/album/published.json', 'public/album'], { cwd: root, stdio: 'pipe' }); }
    catch { throw new Error('当前有未提交的纪念册内容修改，请先保留 / 整合，再应用新包。'); }
  }
  if (pack.assets.length !== document.assets.length) throw new Error('内容包素材数量不一致');
  const images = new Map(), seen = new Set(); let total = 0;
  for (const item of pack.assets) {
    const asset = document.assets.find(a => a.id === item.id);
    if (!asset || seen.has(item.id) || typeof item.data !== 'string') throw new Error('素材清单无效');
    const match = /^data:(image\/(?:webp|png|jpeg|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(item.data);
    if (!match || match[1] !== asset.mime) throw new Error('图片编码 / 类型无效');
    const data = Buffer.from(match[2], 'base64'); total += data.length;
    if (!data.length || data.length > 20 * 1024 * 1024 || total > 120 * 1024 * 1024) throw new Error('图片超出大小限制');
    const valid = asset.mime === 'image/webp' ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
      : asset.mime === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : asset.mime === 'image/jpeg' ? data[0] === 255 && data[1] === 216 : /^GIF8[79]a$/.test(data.toString('ascii', 0, 6));
    if (!valid) throw new Error('图片文件头与类型不一致');
    const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[asset.mime];
    const name = `${hash(data)}.${ext}`; asset.src = `./album/assets/${name}`; images.set(name, data); seen.add(item.id);
  }
  validateDocument(document);
  if (args.includes('--check')) { console.log(`校验通过：${document.chapters.length}章、${images.size}个优化素材；未写文件。`); }
  else {
    const stage = await mkdtemp(join(tmpdir(), 'tides-album-'));
    try {
      const destination = join(root, 'public/album/assets'); await mkdir(destination, { recursive: true });
      for (const [name, data] of images) {
        const path = join(destination, name);
        let existing; try { existing = await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (existing) { if (!existing.equals(data)) throw new Error('已有图片与同名校验值不一致，停止写入'); }
        else { await writeFile(join(stage, name), data); await rename(join(stage, name), path); }
      }
      // Manifest is committed last; original photographs never enter public/.
      const manifest = join(root, 'src/album/.published-next.json');
      await writeFile(manifest, JSON.stringify(document, null, 2) + '\n'); await rename(manifest, join(root, 'src/album/published.json'));
      console.log(`已应用到本机源码：${document.chapters.length}章、${images.size}个优化素材（${total}字节）。`);
      console.log('下一步：本地预览 / 测试、更新README，再明确选择发布。此命令未推送或部署。');
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
} catch (error) { console.error(`未应用内容包：${error.message}`); process.exitCode = 1; }
