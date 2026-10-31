# 自然天气演变、雷雨声景与远处飞鸟

创建：2026-10-31（北京时间） · 本地 Codex · 基线：`33b9075`

## 当前决定

作者希望天气独立于本地真实气象，随机自然演变，切换有过程；加入雨天雷电 / 雷声、雨落海面、雨天与大风声景，以及偶发小鸟、海鸥和老鹰盘旋、升高、远去。按此次明确需求实施，完成一步即更新本文；仅开发分支代码、测试与本地预览，不发布，不改 `docs/`、部署或依赖。原环境需求原文与原47项 / 15完成保留。

改动前现状：天气本来就不接天气API；九种状态主要由每日种子决定，日内变化太小。已有六秒调试渐变、风倾雨线 / 雪、波面扰动，但尚无天气锋面过程、雷电 / 雷声、海面雨圈或鸟类。

## 实施决定

- 保持季节气候与同日总体趋势，用确定性随机锋面让日内天气有变化；刷新或返回时仍处于同一个世界，不刷新抽签。自然锋面约32–88分钟间隔，过渡约6–10分钟；先积云 / 起风，再下雨，雨停后云才散。强制调试仍用较快且分阶段的过渡。
- 雷电只在满足强降雨、厚云与风的雷暴条件下偶发出现；远处细小分叉与云内照亮，音速决定雷声延迟。减少动态模式关闭闪光。风声 / 雨声复用单个Web Audio设备，随天气、静音、唱片、阅读和后台状态平滑调节，不补播错过的雷声。
- 海面雨圈在已有海面shader计算，随距离降低细节，跟随真实波面，不在室内或礁石上添加独立粒子。保持预算，不引入后处理或额外阴影灯。
- 飞鸟以绝对时间调度，少量且留空档；不同体形 / 翼拍和滑翔，盘旋路径逐渐升高远去，运动切线决定朝向。恶劣天气与夜间减少 / 停止活动；共享几何 / 材质与对象池，省电降数量。
- 所有新系统复用现有RAF / 相机 / 预热 / 质量策略与暂停释放；原有入室、猫、唱片、纪念册流程保留。天文时钟与设备时间关系不改变，天气始终明确为模拟。

## 逐步进度

| 步骤 | 内容 | 状态 | 实际证据 / 下一步 |
| --- | --- | --- | --- |
| L00 | 同步基线、检查共享环境、采集修改前性能 | 完成 | `33b9075`工作区干净且远端同步；Node24.14.0、现有依赖 / store复用；三次串行基准采集完成，结果保存在仓库外 |
| L01 | 确定性日内天气与分阶段过渡 | 完成（逻辑 / 适配器） | 新增五项天气逻辑、季节与毫秒连续性、真实适配器六秒分阶段 / 中断续接测试通过；自然锋面32–88分钟 / 过渡6–10分钟 |
| L02 | 远处雷电、延迟雷声与风雨声音 | 完成（Chrome画面 / 原生音频信号） | 雷暴 / 雷声门控、两项原生离线信号、音频失败注入和原生降级通过；实际海上雷闪、减少动态关闭闪光、单设备及平滑静音 / 唱片压低通过 |
| L03 | 海面雨点与波面光照联动 | 完成（真实像素） | 四邻域扩散雨圈 / 法线微扰在真实海面产生像素差异；室外降雨边界、低画质 / 减少动态通过；复用原网格与纹理 |
| L04 | 飞鸟模型、飞行路径、调度和天气联动 | 完成（真实像素 / 运动） | 小鸟 / 海鸥 / 老鹰一笔实例绘制，普通最多4 / 省电目标2；四项轨迹 / 朝向 / 滑翔 / 天气渐隐 / 刷新及三类鸟窗内像素 / 移动通过 |
| L05 | 类型 / 构建 / 自动测试、真实渲染和声音信号验证 | 完成（本机范围） | 首批42项、问题修复后34项及最终全套185项通过（7.1分钟）；最终类型 / 生产构建通过，八种桌面 / 手机生产场景通过，性能与Safari原生复验通过；实体设备及主观试听另记 |
| L06 | 性能比较、文档、分支交付 | 完成（本机范围） | 三次同条件基准 / 大雨省电CPU4× / Safari原生复验通过；README、技术 / 性能 / 方案及JSON同步，普通推送开发分支 |

## 证据记录

- 修改前三次：`CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ~/.local/bin/project-node scripts/measure-performance.mjs --output=/tmp/memory-living-weather-before-N.json`，N=1/2/3，串行，无并发GPU任务。实际数据汇总见L06与本轮JSON，不套用历史性能结果。
- Browser插件未提供；沿用项目Playwright、已有Mac Chrome与本机Safari脚本进行可重复验证，不安装新浏览器或依赖。

### L01–L04 · 首批逻辑与声音信号验证

- `project-node node_modules/typescript/bin/tsc --noEmit` 与 `project-node node_modules/vite/bin/vite.js build`通过，保留既有Three.js大分包提示；代码后续微调仍须最终复验。
- `project-node node_modules/@playwright/test/cli.js test tests/weather-evolution.spec.ts tests/environment-birds.spec.ts tests/environment-storm.spec.ts tests/environment-audio.spec.ts tests/environment-controller.spec.ts tests/environment-weather.spec.ts tests/environment-debug.spec.ts tests/environment-sky.spec.ts --workers=1 --output=/tmp/memory-living-weather-tests`：42/42通过，约15.1秒。
- 声音测试使用原生OfflineAudioContext渲染实际合成图，验证雨声 / 风声频段区别、静音零输出、唱片压低、播放中平滑静音及节点复用 / 释放；不等同扬声器试听。

### L05 · 初轮问题记录（历史，均已在下节解决）

以下保留发现时的待办描述，修复与复验证据见下一节。

- 手动预览强风时，风速已联动云 / 音效 / 船流，但原天气profile的波幅仍不变；需在明确风速覆盖分支增加有界风浪贡献，保持原海面±1.8m剔除界限。
- 可选天气音频工厂若在中途创建节点失败，需要清理部分图，并确保原海浪声继续初始化；待加故障注入回归。
- 整站回归运行期间不修改应用源码，结束后再补强并重跑相关验证。

- 首轮真实场景回归发现海面GLSL变量`active`为WebGL保留字，编译日志明确报错；TypeScript / 构建无法替代真实GPU检查，待改名并重跑受影响流程。另旧集成测试仅等5秒、而分阶段清雨需完整约6秒才回到晴天，需按实际过渡时长验收。失败诊断保留在`/tmp/memory-living-weather-full-tests/`。

### L05 · 首轮问题修复与复验

- 海面GLSL保留字改为`dropWeight`；旧天气集成测试按完整六秒清雨过程设置十秒验收上限。四种环境 / 六航向、阅读 / 后台恢复及普通访客边界的三项真实场景测试重跑通过。
- 风速覆盖增加有界波幅贡献（最多1.6倍）；自动 / 非有限覆盖 / 零风及九天气×七风速回归通过，不凭空生成降水。
- 天气音频完整创建、连接成功后才启动，失败清理部分节点；工厂失败不阻断原海浪、LFO与猫声。新增创建 / 连接 / 启动故障注入及原生浏览器可选声像失败回归通过。
- 桌面新增真实场景测试通过：雨圈实际海面像素、实际雷闪、三类鸟窗内可见像素及移动、预热零新增静态上传 / 编译、画质切换资源稳定、阅读停算和返回恢复。

- 问题修复后相关34项串行复验全部通过（2.6分钟），原开门 / 小屏翻页两项未改源码或断言便通过，首轮失败保留且纳入最终整套复验。移动端390×844 / 844×390、抚猫回桌、减少动态与室外雨边界通过。
- 鸟类材质明确`forceSinglePass=true`，避免Three.js双面透明默认两次绘制；新增实际渲染调用差断言确认全部可见鸟只占一笔。最终完整185项在此修正后冻结源码运行。

### L05 · 最终自动验收

- 冻结源码后运行`project-node node_modules/@playwright/test/cli.js test --workers=1 --output=/tmp/memory-living-weather-final-tests`：**185/185通过，7.1分钟**，不使用重试掩盖失败。原有迷雾 / 开门 / 看猫 / 唱片 / 纸页双面 / 小屏阅读 / WebGL故障阅读 / 后台与渲染睡眠均通过。
- 最终`project-node node_modules/typescript/bin/tsc --noEmit`及`project-node node_modules/vite/bin/vite.js build`通过，85模块；应用包`index-DyfhbZEA.js`295.40KB / gzip109.21KB。保留原Three.js分包超过500KB提示，未修改部署或依赖。
- 新场景测试中，三种鸟实际窗内像素、移动和一笔绘制均通过；几何 / 纹理 / 程序在循环画质与阅读返回后保持稳定。

- 生产八场景临时脚本第一轮在雨暮清雾步骤触及Playwright默认5秒等待上限（前两场景通过）；保留`production/initial-failure.json`，将其与仓库既有45秒按实际绘制帧等待规则对齐后复验，应用源码未变。最终生产结果见后续记录。

- 最终生产预览八场景全部通过：1280×800晴午 / 雨暮 / 雪 / 满月、320×568省电、390×844多云省电 / 雪、844×390雨；月夜与手机雪天还完成看猫抚摸、回桌、翻册切章与返回。无页面 / 控制台错误、无水平溢出；截图与状态保存在外部`production/`。

### L06 · 性能、Safari与交付

- 三次同机串行采样：960×640、DPR1、减少动态、每次5秒、Chrome156 / ANGLE Metal Apple M1 Pro；修改前 / 后FPS中位60.006 / 60.004，帧间隔P95 17.6 / 17.7ms，CPU渲染提交P95 1.3 / 1.4ms，加载1075.1 / 1020.8ms。固定几何248→251、纹理39不变、程序51→54；绘制量受当时天气 / 航次影响，GC影响堆数据，不声称更快或更省内存。
- `CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' project-node scripts/measure-performance.mjs --width=390 --height=844 --dpr=2 --cpu=4 --url='http://127.0.0.1:5173/?debugEnv=1&envWeather=heavy-rain&envQuality=low' --output=/tmp/memory-living-weather-stress.json`：29.985FPS、P95 36.3ms、CPU提交P95 3.9ms、加载2822.8ms，251几何 / 38纹理 / 47程序，实际DPR被省电限制为1，无错误；这是桌面实验，不是实体手机。
- `project-node scripts/verify-environment-safari.mjs --timeout=60000 --output=…/memory-living-weather/safari`：Safari27.2原生8步 / 15次可信点击通过，38.193秒；清雾推门、看猫抚摸回桌、翻册切章返回、雨暮、静音开关与省电，五张截图复核。未测Safari性能、实际音频播放或全部新增天气 / 鸟类视觉；后导航错误观察不是完整启动控制台捕获。
- 原始前后采样、生产八场景、Safari摘要与限制汇总至[本轮JSON](benchmark/living-weather-2026-10-31.json)，性能解释见[PERFORMANCE.md](PERFORMANCE.md)。本轮未重跑此前180秒持续脚本，不套用其结果。
- 新 / 改模块：`weather-controller`、`bird-controller`、`storm-controller`、`weather-audio`、环境适配 / 天空 / 调试、海面shader及原声音控制器；复用`scene` / `main`回调集成。新增天气锋面、雷暴、飞鸟、音频及真实场景测试，更新原天气 / 环境渐变断言。
- 待作者试听程序风雨雷声；实体手机、长期低端设备温度 / 电池 / 进程 / GPU内存仍需后续实测。天气和鸟为景观近似，雨圈不逐粒碰撞，不声称完整气象、流体或生态仿真。
- 本机复用`~/.nvm/versions/node/v24.14.0`、`~/.local/bin/project-node`与现有`node_modules` / `~/Library/pnpm/store/v11`；文档检查用`~/.local/bin/document-python`。本轮没有安装、迁移、清理或隔离环境，共享store实测仍1,445,180KiB。
- 本机证据目录：`/Users/jiangyuhan/.codex/visualizations/2026/10/31/memory-living-weather`。仅代码 / 文档开发分支交付与4173本地预览，`docs/`、部署和依赖配置未变。

- 磁盘基线：项目185,460KiB、共享store1,445,180KiB；本轮源码 / 本地构建 / 测试图产生项目内增长，截图 / Safari / 诊断另存仓库外。提交后的最终`du -sk`、差值、提交号与远端状态写入上述证据目录`delivery.json`，不清理用户输出以缩小数字。
