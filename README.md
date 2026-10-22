# 潮汐之间 · Between the tides

海边房间主题的互动回忆纪念册。TypeScript + Three.js + Vite，无后端、无外部素材请求，无需 API 密钥。

## 开发

需要 Node.js 22.12+（本环境验证版本为 24.19.0）。在项目目录执行：

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

安装使用锁文件。`/workspace/.npm-cache` 解决云环境用户目录不可写的问题；其他机器可以省略 `--cache`。

```sh
npm run typecheck
npm run build
npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
```

源码已推送到 `petitmort/memory` 的 `main` 分支。生产构建同时保存在 `docs/`，使用相对资源路径，支持 GitHub Pages 的 `/memory/` 子路径。

## GitHub Pages 发布

在仓库 Settings → Pages 中，将 Source 设为 **Deploy from a branch**，Branch 选择 **main**，目录选择 **/docs**，保存。部署成功后，站点地址为 `https://petitmort.github.io/memory/`。是否已启用与部署状态，以 GitHub Pages 设置页显示为准。

更新源码后重新生成并提交 `docs/`：

```sh
npm run build
cp -R dist/. docs/
touch docs/.nojekyll
git add docs
git commit -m "Update published site"
git push
```

也可以将完整 `dist/` 发布到其他静态托管服务。

## 体验

- 第一次点击驱散雾气，第二次点击开门。过渡期间锁定操作，防止误触。
- 开门后镜头直接过渡到房间固定视角，不先靠近桌面再回拉。窗帘和海面轻微移动，海浪声淡入。右上角可随时静音。
- 点击花束或按钮，移开花束、打开书封，再进入纸质纪念册；开册和返回都保持房间机位。
- 花束使用独立卷边花瓣、错落的花心与玫瑰红配色，通过四组实例批量绘制花瓣。
- 桌面使用左右按钮、方向键、章节圆点翻页；手机支持左右滑动与纵向阅读。
- 返回房间保留当前章节。点击左上角名称重新开始体验。
- 支持键盘焦点、阅读焦点限制、Escape 返回及减少动态效果偏好。
- 画质自适应限制最高像素比，持续低帧率时降低分辨率；另有省电档。
- 页面在后台停止绘制、暂停音频。WebGL 不可用时可直接阅读纪念册。

首次版本使用四章示例文案和本地生成的原创插画，不包含用户的私人回忆或照片。

## 换成自己的回忆

编辑 `src/content.ts` 中的 `chapters` 数组：

- `title`：章节标题，`date`：章节编号与名称，`subtitle`：英文小标题。
- `text`：短句，`note`：正文。字符串内的 `\n` 表示换行。
- `caption`：图下注释。
- `scene`：内置插画主题，支持 `coast`、`sunset`、`mountain`、`night`。
- 可选 `image`：照片路径。例如把照片放入 `public/memories/first.webp`，填写 `image: '/memories/first.webp'`。加载失败时回退到插画。

建议照片使用 WebP，宽度约 1200 像素。默认照片按画框裁切。章节和页码按数组长度自动生成。

## 文件

- `src/main.ts`：交互状态、阅读、音频与无障碍。
- `src/scene.ts`：3D 房间、门、桌面、花束、镜头、海面与画质控制。
- `src/content.ts`：内容和原创程序插画。
- `src/bouquet.ts`：不规则独立花瓣、玫瑰花型、叶片和丝带。
- `src/style.css`：版式、书页动画、桌面与手机版适配。
- `tests/experience.spec.ts`：浏览器交互回归。

## 浏览器测试

本云环境已有 `/usr/bin/chromium`，不需要另行下载浏览器。

```sh
npm test
```

其他机器请修改 `playwright.config.ts` 的 `executablePath` 为已安装浏览器，或删除此项并通过 Playwright 安装 Chromium。测试覆盖桌面完整交互、手机滑动、减少动态效果和无 WebGL 降级，并记录真实渲染相机，检查入室不回拉、开册与返回不改变机位。软件渲染测试不能代表真实手机帧率，流畅度还需在目标设备验证。
