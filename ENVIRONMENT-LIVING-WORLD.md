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
| L04 | 飞鸟模型、飞行路径、调度和天气联动 | 完成（真实像素 / 运动） | 小鸟 / 海鸥 / 老鹰一笔实例绘制，首轮普通最多4 / 省电目标2（后续A02修订为单只）；四项轨迹 / 朝向 / 滑翔 / 天气渐隐 / 刷新及三类鸟窗内像素 / 移动通过 |
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

## 太阳、云层与单只飞鸟修订（2026-10-31）

基线`9640e9d`，本地Codex；作者反馈窗外只有亮光、看不到云与太阳，鸟群同步动作不自然。此批只修天空 / 太阳窗景和单鸟，不发布网站，不变更原始环境需求与47项统计。

| 步骤 | 内容 | 状态 | 依据 / 下一步 |
| --- | --- | --- | --- |
| A00 | 核查真实窗景与天体投影 | 完成 | 当前 / 10月31日落 / 夏季多云三组修改前截图已保存；原南向窗在全年5分钟采样中太阳中心无透窗交点，低空渐变偏灰白且云缺少明暗对比 |
| A01 | 西向场景地理朝向、蓝天与云层层次 | 完成（真实像素） | 保留房间和相机；默认northYaw改为3π/2，让傍晚太阳可进入窗景；太阳 / 月亮 / 光照 / 海面方向共同计算。桌面 / 手机太阳圆盘、低空蓝色及普通 / 省电云层实际像素断言通过 |
| A02 | 稀疏单只飞鸟与独立节奏 | 完成（逻辑 / 真实场景） | 普通 / 省电均1只，5分钟候选 / 60%出现，每航次确定性翼拍频率 / 滑翔周期 / 相位变化；5项纯测试及三类鸟实际窗内像素、移动、天气渐隐 / 阅读返回通过 |
| A03 | 回归、生产预览、文档与分支交付 | 完成（本机范围） | 45项相关回归及云释放补强后11项重叠复验、最终类型 / 构建、六个生产场景和同机性能抽样通过；代码 / 方案 / README / 技术 / 性能 / JSON同批交付开发分支，提交与推送结果由Git及外部delivery.json追踪 |

太阳继续沿真实天文轨迹；正午过高、夜晚落下或位于窗框外时不强制可见。西向窗优先展示下午 / 傍晚太阳，存在季节和手机裁切差异。

### A03 · 首轮验证与清雾问题

- 首轮相关40项39通过；桌面 / 手机真实日落圆盘像素与海面反射方向、三类单鸟及关键流程通过。云层测试在清雾按钮停留“风正在经过…”时失败，尚未执行云像素断言，保留`/tmp/memory-sky-birds-tests/`。
- 实际绘制时钟在结束前，`a<1`但`smoothstep(a)`可能舍入到1，旧`fogClearance<1`判断从下一帧跳过仍活跃的动画，完成回调永久无法触发。新测试注入这个边界并实际渲染、暂停后台、恢复；旧代码稳定失败（`/tmp/memory-fog-rounded-before/`），不是通过延长等待掩盖。
- 仅将清雾更新条件扩展为“仍有活动动画或尚未清空”，保留真实末帧绘制后才完成、后台暂停与两次入室点击。分别补验100ms减少动态与1850ms普通动画；没有修改时长、门扇 / 镜头路径或操作顺序。

### A03 · 自动回归与生产构建

- `project-node node_modules/@playwright/test/cli.js test tests/environment-window-sky.spec.ts tests/environment-birds.spec.ts tests/environment-celestial.spec.ts tests/environment-weather.spec.ts tests/environment-sky.spec.ts tests/environment-controller.spec.ts tests/environment-integration.spec.ts tests/environment-living-world.spec.ts tests/performance.spec.ts tests/experience.spec.ts tests/mythology.spec.ts tests/entry-motion.spec.ts --workers=1 --output=/tmp/memory-sky-birds-final-tests`：**45/45通过，3.3分钟**。包含两种清雾时长的舍入 / 暂停边界、两次点击 / 门先镜头后、太阳 / 反射方向、云窗内像素、三类单鸟、雨雪 / 手机横竖屏、看猫 / 开册切章返回 / 声音状态 / WebGL兜底及阅读 / 后台停绘制。
- 日落圆盘在1280×800与390×844实际贡献可见像素；多云正午低空蓝色的B−R均值大于30、云体改变超过200像素，普通 / 省电均一笔云绘制且几何数量稳定。截图库保存在外部`memory-sky-birds`目录；正午高太阳保持窗外真实方位。
- 只读复查发现云实例释放遗漏`InstancedMesh.dispose()`，它拥有独立的instanceMatrix缓冲；补齐该调用与幂等释放断言。修改后`project-node node_modules/@playwright/test/cli.js test tests/environment-weather.spec.ts --workers=1 --output=/tmp/memory-sky-cloud-dispose-tests`：11/11通过（4.5秒），复验含实际云shader / 雨雪缓冲与全天窗内云分布；与上述45项重叠，不计为56个唯一用例。
- 最终`project-node node_modules/typescript/bin/tsc --noEmit`与`project-node node_modules/vite/bin/vite.js build`通过，85模块、应用包`index-BGQx3S7h.js`295.97KB / gzip109.38KB；既有Three.js大分包提示保留。未安装依赖、未修改部署与发布产物。

### A03 · 生产画面、性能与交付边界

- 最终构建4173预览，临时Playwright脚本`/tmp/memory-sky-production.mjs`完成六场景：桌面 / 手机10月31日17:10晴朗日落，桌面多云正午、手机多云省电、844×390雨暮、桌面夜间。夜间另完成看猫抚摸 / 回桌 / 开册 / 切章 / 返回；六场景均无页面 / 控制台错误、横向溢出或兜底误触发。截图逐张复核，生产状态摘要写入[天空专项JSON](benchmark/sky-window-2026-10-31.json)。
- `CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' project-node scripts/measure-performance.mjs --output=/tmp/memory-sky-birds-performance.json`：960×640 / DPR1 / 减少动态 / 5秒，Chrome156 / ANGLE Metal Apple M1 Pro，60FPS、帧间隔P95 17.4ms、CPU提交P95 1.1ms、加载1110.1ms、入室2508.3ms；251几何 / 39纹理 / 54程序，131绘制调用，无错误或自动降档。
- 对照上一批历史三次中位60.004FPS / P95 17.7ms / CPU提交1.4ms，固定资源不变；本轮只取一次，天气与绝对航次未锁同，缓存 / GC亦影响加载与堆，不声称提速、节省内存或长期无泄漏。未重跑整套185项、Safari与180秒持续实验；扬声器试听、实体手机、低端设备温度 / 电池 / 进程 / GPU内存仍待验。
- 复用`~/.nvm/versions/node/v24.14.0`、`~/.local/bin/project-node`、既有`node_modules`与`~/Library/pnpm/store/v11`；文档 / JSON使用共享`document-python`，没有安装、环境迁移、手动清理或新隔离环境。最终磁盘快照及与上一交付快照的差值记录外部`memory-sky-birds/delivery.json`，包含源码、Git、忽略的构建 / 测试缓存，不能归为环境占用优化；共享store仍1,445,180KiB。
- 原47项 / 15完成、完整需求原文、部署 / 依赖配置校验保留；源码与文档普通提交 / 推送`codex/calendar-environment-requirements`，不合入main、不改docs、不发布。新增测试为`environment-window-sky.spec.ts`与既有鸟 / 天文 / 云 / 入室回归补强；README与AGENTS交接规则已同步。

## 风浪、帆船、雷雨与海岸扩展（2026-10-31）

基线`cc10a4d`，本地Codex。作者明确要求鸟在滑翔时持续移动、大雨之后新增独立雷雨并增加雷电 / 雷声，风速 / 风向驱动海浪、船帆 / 航向 / 航速，调节各类密度与强度提供更多等级，优化礁石并增加最远处岛屿。本次直接实施这些范围，继续仅本地预览与开发分支交付，不发布。

| 步骤 | 内容 | 状态 | 当前步骤 / 下一步 |
| --- | --- | --- | --- |
| B00 | 核查基线、共享运行时和联动缺口 | 完成 | 工作区干净、远端已fetch、基线cc10a4d；复用Node24.14.0与现有依赖。发现海岸还残留三只常驻旧鸟，主波方向 / 速度及航次尚未接风 |
| B01 | 单鸟真实滑翔移动、岩礁与遥远岛屿 | 完成（逻辑 / 真实画面） | 移除三只旧常驻鸟；滑翔航迹持续横移升高，桌面 / 手机投影和实际鸟像素通过；不规则沉水岩体、三座合批远岛实际可见 |
| B02 | 独立雷雨与更多强度 / 密度级别 | 完成（相关验收） | 天气菜单大雨后新增雷雨，增强16–40秒不规则放电 / 延迟雷声；云 / 雨雪 / 风 / 浪 / 雷 / 船鸟多档预设及精确输入、重置与不持久化测试通过；真实雷闪 / 减少动态像素通过 |
| B03 | 风向 / 风速驱动统一CPU / GPU海浪 | 完成（GPU配对） | 固定相位八方向频谱平滑交接；八风向能流、强风能量与表观速度、长期相位连续、1.8m包围界限通过；25组GPU高度 / 法线与CPU配对和真实海面像素通过 |
| B04 | 航路 / 航速 / 船帆与风联动 | 完成（相关验收） | 出发风计算可航路线 / 方向及平均速度，当前风平滑调帆 / 鼓胀 / 收帆；六船型纯逻辑、安全避岛 / 间距、后台恢复和资源复用通过，桌面 / 手机实际帆布与水线通过 |
| B05 | 联动验收、性能、文档与分支交付 | 完成（本机范围） | 整套206首轮204通过，两处测试兼容问题修复后相关29项通过（含3新增），最终像素2项复验通过；类型 / 构建、九场景生产预览、三次默认与手机雷雨CPU4×性能抽样、文档校验完成，普通交付开发分支，不发布；实机 / 试听等边界见下文 |

风向统一表示“吹向”的世界X/Z角，0°为+X、90°为+Z，并在调试面板明确说明。默认模拟天气仍按季节与绝对时间演变，调试覆盖只在本页生效。帆船为景观航行近似：出发风决定本航次的路径与平均速度，当前风调帆；不会为追求瞬时风响应重置整条航程。验收结果在实际运行后逐步补录，不借用上一批45项或历史185项。

### B05 · 问题修复与实际验证

- `project-node node_modules/@playwright/test/cli.js test --workers=1 --output=/tmp/memory-wind-world-all-tests`：首轮206项中204通过、2项失败，7.6分钟。分别是原猫声音轨44100Hz经原生48000Hz解码后相差37.98μs、超过仅一个源帧的测试容差，以及新鸟航次采到的日期小数`.190`被原生输入归一化为`.19`，导致Playwright严格fill失败。修正为一源帧加一输出帧容差、原生规范日期字符串；没有修改猫声资源、动作或生产日期解析。
- 只读复核另发现开发者只固定一个风参数时，云层另一参数被冻结。现每10秒重采自动分量，用旧流段的精确位移和速度接续；日期或覆盖编辑保留已显示位置。两项新增纯测试验证跨锋面速度 / 方向跟随、重锚边界连续与双固定零风静止；新增雷声门控测试验证10分钟雷雨触发超过大雨两倍、每次保持实际声速延迟且不重播。
- 修复后`project-node node_modules/@playwright/test/cli.js test tests/environment-weather.spec.ts tests/environment-controller.spec.ts tests/environment-audio.spec.ts tests/environment-living-world.spec.ts tests/cat-mood-sync.spec.ts --workers=1 --output=/tmp/memory-wind-world-fix-tests`：**29/29通过，46.2秒**。最终`environment-wind-world.spec.ts`另**2/2通过，13秒**；这些与首轮重叠，跨运行共覆盖209个唯一用例，未重跑修复后的整套209项。
- 新真实画面回归比较改变风向前后的海面像素、显示 / 隐藏帆布与遥远岛屿的像素，检查同帧CPU水线与GPU波高 / 法线（25组风场），以及独立雷雨通道的真实窗内闪电与减少动态关闭。三类单鸟真实像素、绘制后位移、单一实例与阅读 / 后台停算通过；航路 / 航速 / 迎风限制、七组岛礁避让范围、船间余量和对象池不增长通过。
- 最终`project-node node_modules/typescript/bin/tsc --noEmit`与`project-node node_modules/vite/bin/vite.js build`通过；85模块、应用包307.86KB / gzip113.83KB，保留原Three.js大分包提示。4173最终构建完成九场景：木帆船、强风双桅、手机双体、渔船、日落游艇、阴天渡船、手机横屏雷雨省电、手机雪天、满月夜间；夜间另完成看猫抚摸 / 回桌 / 开册切章 / 返回。无页面 / 控制台错误、横向溢出或兜底误触发；截图已复核，证据在外部`memory-wind-world/production`目录。

### B05 · 性能与交付边界

- 同机Chrome156 / ANGLE Metal Apple M1 Pro，960×640 / DPR1 / 减少动态 / 每次5秒，使用既有`measure-performance.mjs`三次抽样。FPS中位60.001、帧间隔P95 18.9ms、CPU提交P95 3.8ms；历史`cc10a4d`单次为60FPS / 17.4ms / 1.1ms，未重新建立成对旧版基准。帧率保持但提交耗时增加，不能只以FPS声称无开销；缓存 / GC、天气 / 航次未锁同，不能归因或推导提速 / 节省内存。
- 固定几何251→249、普通纹理39不变、程序54→55；移除旧鸟几何并合批远岛，不加纹理或灯光。普通最多5船 / 1鸟、省电最多3船 / 1鸟。390×844 / 请求DPR2 / 雷雨 / 风16m/s / 省电 / CPU4×单次29.988FPS、帧间隔P95 36.2ms、CPU提交P95 3.9ms，实际DPR1，无错误；省电档主动约30fps，不是实体手机结果。
- 原始样本、生产场景与命令摘要在[本批JSON](benchmark/wind-world-2026-10-31.json)，复用Node24.14.0、`project-node`、现有依赖与共享store，没有安装 / 环境迁移 / 手工清理 / 新隔离环境。原始需求、旧47项 / 15完成、部署 / 依赖与链接校验保持不变。最终磁盘相对本批初始项目165,972KiB / store1,445,180KiB的差值、普通提交 / 推送和远端状态写到外部`memory-wind-world/delivery.json`；不把构建 / Git增长解释为环境占用改善。
- 本批未重跑Safari、180秒持续实验、实体手机或低端设备，也未做扬声器 / 耳机试听、温度 / 电池 / 进程 / GPU内存验证；保留待验。风浪和帆船是景观近似，固定出发风保证航程可恢复，显式强制不可航调试路线使用辅助动力和收帆。代码仅交付`codex/calendar-environment-requirements`，不合入main、不更新docs或线上配置、不发布。

## 闪电可见性修订（2026-10-31）

基线`f7be21f`，本地Codex。作者反馈“闪电看不出效果”；当前预览链接为少云，按规则不触发雷电，真实雷雨的1像素低透明通道 / 云光亦偏弱。本批修正可见性并提供开发预览，保留模拟天气、强对流门控、减少动态、后台 / 阅读和发布边界。

| 步骤 | 内容 | 状态 | 当前步骤 / 下一步 |
| --- | --- | --- | --- |
| C00 | 核查天气与真实闪电呈现 | 完成（源码核查） | 少云门控为0；旧通道固定1物理像素，云光和天空亮度弱、海面只有间接天色变化；本批真实像素检查验证修改后的辨识度，不冒称成对旧版画面测量 |
| C01 | 清晰雷电、云光与海面响应 | 完成（专项验收） | 有宽度和柔边的分叉通道、局部云光及短暂海面反光；桌面 / 手机白天、黄昏和夜晚，普通 / 省电共12组实际像素通过，减少动态关闭且资源稳定 |
| C02 | 一次预览、回归与本地交付 | 完成（本机范围） | 专项10项与相关46项通过，类型 / 构建通过，最终4173桌面 / 手机预览可见；单次性能和文档完成，普通开发分支交付，不发布 |

### C01完成记录

- 将固定1物理像素的半透明线改为预分配的窄带几何，单一材质绘制白色核心与冷色柔光边缘；同一闪电源同步驱动局部云光、云层受光、天空、现有填光及方向一致的海面银色反射。保留原16–40秒不规则增强调度、约550ms单次平滑脉冲、真实窗墙遮挡，不添加灯光、纹理或后处理。
- 隐藏环境调试新增“转为雷雨 · 预览一次闪电”，先进行正常约6秒天气渐变，约7秒后在可见窗景闪一次，雷声仍按距离 / 343m/s延迟。预览不改日历或保存设置；天气 / 时间变更、阅读或后台暂停取消，减少动态关闭按钮并明确说明。
- 最终专项命令：`LIGHTNING_EVIDENCE=<外部证据目录> project-node node_modules/@playwright/test/cli.js test tests/environment-lightning.spec.ts tests/environment-storm.spec.ts --output=/tmp/memory-lightning-third-tests`，10/10通过（1.0分钟）。12组图像分别隐藏闪电 / 云光 / 海面闪光进行差异测量，均有明确可见像素；完整图片与`contrast.json`保存在外部`memory-lightning-visibility`，不把测试探针写入生产包。
- 前两轮18项15通过 / 3失败、8项7通过 / 1失败，问题分别为调试新增按钮复用旧选择器、测试固定日期的时钟偏移、页面初始化读取减少动态而测试只中途改媒体条件，以及测试采样被真实RAF重新更新。已使用独立按钮 / 说明样式、正确测试日期 / 重新加载、同帧恢复采样参数修正；不更改生产的减少动态或天气门控来迁就断言。10项是修正后的专项结果，不累计重跑次数。

### C02验证记录

- `project-node node_modules/@playwright/test/cli.js test tests/environment-audio.spec.ts tests/environment-debug.spec.ts tests/environment-controller.spec.ts tests/environment-weather.spec.ts tests/environment-wind-world.spec.ts tests/environment-living-world.spec.ts tests/environment-window-sky.spec.ts tests/environment-integration.spec.ts tests/performance.spec.ts tests/experience.spec.ts --output=/tmp/memory-lightning-regression-tests`，46/46通过（3.0分钟）。与专项10项无重叠，共56个本轮通过的唯一用例；未重跑上一批整套209项。
- `project-node node_modules/typescript/bin/tsc --noEmit`与`project-node node_modules/vite/bin/vite.js build`通过，85模块，应用包311.35KB / gzip115.08KB（基线307.86KB / gzip113.83KB），原Three.js大分包提示保留。
- 最终4173生产包无测试探针，分别从少云进入，点击真实按钮，约7081 / 7079ms捕获桌面 / 手机雷电；另保存放电前后画面，共六张已复核。无页面 / 控制台错误、横向溢出或兜底误触发；调试天气正确变为雷雨。命令`project-node /tmp/memory-lightning-production.mjs`，外部`memory-lightning-visibility/production`保存原始图片与结果。
- 串行运行现有`measure-performance.mjs`，相同Chrome / 960×640 / DPR1 / 减少动态 / 5秒，当前单次300帧、60.004FPS、帧间隔P95 17.7ms、CPU提交P95 1.1ms，249几何 / 39纹理 / 55程序不变。历史三次中位60.001 / 18.9ms / 3.8ms仅作参考，未新测成对旧版，不作提速结论；此采样关闭雷闪，不代表放电峰值。证据与边界见[本批JSON](benchmark/lightning-visibility-2026-10-31.json)和[性能说明](PERFORMANCE.md)。
- 原始需求、47行 / 15完成、本地文档链接及部署 / 依赖保护检查通过，`git diff --check`通过。复用共享Node / 已有依赖 / pnpm store，未安装或新建环境；仅开发分支及4173本地预览。未重跑Safari、实体手机、主观试听或长期设备实验。
