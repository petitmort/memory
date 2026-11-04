# 日月窗景构图 · 实施记录

来源：本地Codex；北京时间2026-11-01；基线`e890a60`。

后续发布授权（2026-11-04）：作者明确要求发布现有网站，按[发布记录](PUBLISH-2026-11-04.md)整合最新main、构建并验收线上；下文未发布描述保留为11月1日历史交付状态。

交付回执：实现与证据`ab1b6be`已普通推送`codex/calendar-environment-requirements`，核对远端0 / 0；S00–S03完成。本地预览已验证，未发布网站。

作者反馈「太阳月亮总是不在画面中」，随后明确选择观景构图：保留真实昼夜、月相与云层遮挡，调整日月展示轨迹，让晴天白昼和有月亮的夜晚更容易在窗内看到。本任务不计入原47项；只开发、测试和本地预览，不改docs、main或部署配置，不发布。

## 方案

- 天文计算保留原经纬度、日期、季节日照、日出日落和连续月相。展示方向单独变换，将东侧升起至西侧落下的过程展开为窗内从左到右、较低的弧线。
- 展示路径固定在场景世界坐标，不跟着相机或指针移动；桌面和手机共同取景，不移动窗户、桌子、小猫或房间机位。
- 太阳 / 月亮、海面高光、主光方向和云层受光使用同一展示方向；光强和是否升起继续取真实状态。新月、地平线以下及厚云不保证出现可辨认圆盘。
- 普通访客默认观景构图；开发调试保留严格天文方位作为对照。自由流速、减少动态、暂停恢复及对象资源复用不变。
- 复用Node24.14.0、既有依赖和共享pnpm store，不新增资源池、纹理、光源、阴影或循环。

## 步骤

| 步骤 | 是否修改 | 是否完成 | 当前步骤 / 下一步 |
| --- | --- | --- | --- |
| S00 · 核查与改前证据 | 修改 | 是 | 完成桌面 / 手机逐时投影及改前性能：60.012FPS、257几何 / 41纹理 / 62程序，无错误 |
| S01 · 日月展示与光照 | 修改 | 是 | 已实现固定观景轨迹、同源海面 / 主光 / 云层方向与开发严格方位；天文状态 / 月相保留 |
| S02 · 自动化与画面 | 修改 | 是 | 专项12 / 12及其余56 / 56通过，类型 / 构建通过；7种生产场景27图、匹配性能与240时刻投影已复核 |
| S03 · 文档与交付 | 修改 | 是 | README / AGENTS / 技术与性能证据已补齐；实现与证据ab1b6be已普通推送开发分支，核对0 / 0，未发布 |

## 实录（新记录置顶）

### S03 · 开发分支交付完成

- 实现与本轮证据`ab1b6be`已普通推送`codex/calendar-environment-requirements`，推送前再次fetch，无远端新增；推送后与远端0 / 0。没有合入main、修改docs或部署配置，不发布网站。
- 本次仅补Git及环境回执，基线`ab1b6be`。`document-python /tmp/memory-celestial-doc-check.py`通过：原始完整需求、47项 / 15完成均保留，150个本地链接有效，依赖 / 发布配置未变；`git diff --check`通过。未为本次文档回执重复运行已通过的类型 / 构建 / 68项测试。
- 实现首次推送后测量项目166,176KiB，相对改前165,924KiB为+252KiB（包含构建产物、文档与Git对象），共享store1,445,180KiB、变化0。共享Node / 包仓库复用，无安装 / 新环境 / 隔离例外；后续回执自身及Git对象仍会小幅改变项目大小。原始截图在证据目录，未复制依赖或素材到仓库。

### S02 / S03 · 最终生产画面与文档

- `project-node /tmp/memory-celestial-production.mjs`通过，实际生产资源`index-C8DatZlf.js`，不注入生产测试API。7种场景：桌面 / 手机夏至正午、桌面少云 / 手机晴朗满月夜、桌面日落、严格天文正午对照、3600倍自由完整昼夜；每场景清雾 / 推门、读册返回，页面与控制台错误0，无横向溢出、故障或开发错误覆盖层。
- 共27张截图：14张主画面 / 返回画面，以及13帧自由流速连续采样，模拟时间从11月24日12:00至次日14:24，自由模式时钟隐藏。已目视复核最终正午与满月桌面 / 手机画面，圆盘均在窗景中，海面与室内照明保持连贯。原始`production/results.json`及截图保存于本方案证据目录，本轮JSON追加场景与生产构建信息。
- README使用说明 / 更新日志、AGENTS交接、ENVIRONMENT技术配置、PERFORMANCE及JSON样本已更新。没有改原始需求、47项 / 15完成统计、锁文件、依赖、docs或部署。复用`~/.local/bin/project-node`→`~/.nvm/versions/node/v24.14.0`、既有项目依赖及`~/Library/pnpm/store/v11`，无安装、新环境或隔离例外。
- 最终记录追加前项目165,980KiB，相对改前165,924KiB为+56KiB；共享store仍1,445,180KiB，变化0。Git对象与后续文档会继续影响项目大小，交付后另记测量；不把图像证据目录算作依赖安装。提交前已再次fetch，开发分支与远端0 / 0，Git交付完成后补回执。

### S02 · 最终构图机会与匹配性能

- 用最终7.5°高度 / −9°偏移重新执行真实机位逐小时投影，覆盖五个日期、桌面 / 手机，共240个时刻。夏至太阳可见整点桌面由0变11个、手机由0变14个；其他季节也显著增加。这里保守排除中框，只表示几何机会，不能等同无云遮挡、完整圆盘像素或全天保证；实际GPU圆盘验收仍使用上条专项。
- 测量同机Chrome / Metal、960×640 / DPR1 / 普通 / 完整动态 / 夏至12:00晴 / 无船鸟、默认暖光，前后各一次5秒：300 / 301帧，60.012→60.016FPS，帧间隔P95 17.6→17.2ms、CPU提交P95 1.3→1.4ms；139 / 390,449→143 / 390,519次绘制 / 三角形，257几何 / 41纹理 / 62程序不变，页面错误0、采样途中未降档。
- 圆盘进入画面会增加当帧绘制，未新增常驻资源；接近60Hz的单次短样本不证明提速或净GPU成本，CPU提交不是GPU完成时间。本轮没有独立手机性能采样，未重跑Safari或实体设备；实际省电 / 手机画面另行复核。
- 测量脚本复用`/tmp/memory-time-flow-performance.mjs`，仅沿用已有Playwright绝对导入和完整动态偏好 / 元数据，本轮不设自由倍速。采样参数`--sample-ms=5000`，查询`?debugEnv=1&envTimeMode=scene&envDate=2026-06-21T12:00&envWeather=clear&envQuality=normal&envDensity=0&envBirdDensity=0`。源码保持冻结，GPU测量 / 投影 / 生产预览串行。[本轮JSON](benchmark/celestial-window-2026-11-01.json)与[性能说明](PERFORMANCE.md#2026-11-01--日月窗景构图)保存样本和限制。

### S02 · 本轮68项通过

- 最终专项4个spec12 / 12通过（43.9秒）：`celestial-view`、`environment-window-sky`、`environment-debug`、`environment-sky`。四季正午与满月夜在桌面 / 手机都贡献真实圆盘像素；日落保留原>20像素门槛，月相 / 厚云以GPU增加的亮度验证。主光与圆盘 / 海面同向，严格方位、读册返回及资源复用通过。
- 另11个spec56 / 56通过（3.7分钟）：`environment-celestial`、`environment-controller`、`environment-integration`、`night-sky`、`night-coast-integration`、`time-flow`、`desk-clock`、`room-light`、`performance`、`experience`、`onboarding`。覆盖日历 / DST / 日出日落 / 月相、云雨雪 / 6航向、自由流速 / 雷雨音效 / 航程刷新、星空银河 / 灯塔、入室 / 看猫 / 声音 / 阅读 / 故障、预热零新增编译上传 / 阅读后台停算和恢复。两个最终组去重68项，不累加之前失败及中间重叠轮次，不宣称整个历史测试库已重跑。
- 最终实际命令如下，两组互不重复，GPU测试串行：

```sh
SKY_WINDOW_EVIDENCE='/Users/jiangyuhan/.codex/visualizations/2026/11/01/memory-celestial-window/tests' \
project-node node_modules/@playwright/test/cli.js test \
  tests/celestial-view.spec.ts tests/environment-window-sky.spec.ts \
  tests/environment-debug.spec.ts tests/environment-sky.spec.ts \
  --output=/tmp/memory-celestial-window-confirm

project-node node_modules/@playwright/test/cli.js test \
  tests/environment-celestial.spec.ts tests/environment-controller.spec.ts \
  tests/environment-integration.spec.ts tests/night-sky.spec.ts \
  tests/night-coast-integration.spec.ts tests/time-flow.spec.ts \
  tests/desk-clock.spec.ts tests/room-light.spec.ts tests/performance.spec.ts \
  tests/experience.spec.ts tests/onboarding.spec.ts \
  --output=/tmp/memory-celestial-window-regression
```

- `project-node node_modules/typescript/bin/tsc --noEmit`、`project-node node_modules/vite/bin/vite.js build`通过：100模块，应用365.36KB / gzip135.50KB，CSS41.20KB；Three既有大包提示保留。没有依赖或发布产物变更，生产画面与匹配性能待本步补齐。

### S01 / S02 · 实现与首次复核

- 新`celestial-view.ts`只做展示映射，方位为`−9° + 10.5° × sin(天文方位相对南方夹角 / 2)`，高度为`7.5° × sin(真实高度)`。路径固定于场景，不依赖相机；低幅度弧线兼顾桌面 / 手机，仍随实际天体升落、季节高度运行。实际日出 / 日落、连续月相、天气 / 昼夜强度保留，严格模式直接复用原方向。
- 圆盘位置和海面高光使用完全相同的坐标，主光指向该展示光源，云受光使用展示方向；没有新物件、纹理或光源。`?debugEnv=1&envCelestialView=astronomical`可对照真实位置，开发面板「日月方位」切换和重置不持久化，普通访客始终默认观景。
- 第一版弧线在桌面上午接近中框，手机日落圆盘恰好只贡献20像素，未满足原>20阈值。调整路径偏移与高度，保留原阈值后日落与蓝天 / 云层均通过；不是放宽像素门槛。
- 新增真实四季正午、真实满月夜、海面 / 主光同向、严格对照、阅读返回和GPU资源验证。第二轮12项11通过，新增项在新月检查失败：统计了“变化像素”，暗月遮挡背景也会计入，不能代表亮面。改为比较实际GPU绘制增加的亮度，保留月相shader，完整专项待复验。
- 改前性能使用已有脚本临时副本串行单次5秒，夏至12:00 / 晴 / 普通 / 完整动态 / 960×640 / DPR1 / 无船鸟：300帧 / 60.012FPS / 帧间隔P95 17.6ms / CPU提交P95 1.3ms；139绘制 / 390,449三角 / 257几何 / 41纹理 / 62程序。单次样本不作提速或因果结论，最终补同条件after。

### S00 · 原因与用户选择

- 原默认朝西窗户宽3m、高1.6m，物理开口Y=.85–2.45m；真实正午太阳通常高于窗顶，月亮也常在东侧或头顶。旧回归曾明确允许夏至正午太阳在窗外，不是本轮目标所需的观景效果。
- 实际清雾 / 推门进入桌面1280×800与手机390×844后，使用真实机位逐小时投影春分 / 夏至 / 秋分 / 冬至 / 11月1日。桌面太阳可见整点分别只有18 / 无 / 19 / 17 / 17点；手机为18 / 无 / 19 / 无 / 17点。有些夜晚月亮在地平线上却仍不在窗内。几何可见不代表圆盘未被云遮挡，后续补GPU像素。
- 作者已明确选择观景构图。天文原始方向仍保留用于严格对照，不将新展示路径宣称为真实天体方位。
- 验证路径：入室 → 正午 / 日落 / 有月夜窗景 → 自由流速观察运行 → 读册返回 → 手机 / 省电复核。Browser plugin not available，按前端测试技能使用已有Playwright和系统Chrome，不安装浏览器。
- 原始证据目录`/Users/jiangyuhan/.codex/visualizations/2026/11/01/memory-celestial-window`；初始项目165,924KiB，共享store1,445,180KiB。本轮尚未运行新功能测试，不能沿用历史结果。
