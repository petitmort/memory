# 保持画质与内容的性能优化

**当前发布状态（2026-11-12）**：作者已明确要求「上传网站」，本方案已完成成果随完整预览合入main并由`85fc9ad`发布，Pages部署成功；本轮线上验收、证据与限制统一见[发布记录](PUBLISH-2026-11-12.md)。下文“不发布 / main仍2574e99”为当时开发历史，不能作为当前停点；原47项仍27 / 47，不授权未来自动发布。

2026-11-12（北京时间） · 来源：本地Codex · 基线`03fa58b` · 分支`codex/render-performance`。

**交付回执**：F00–F05本机范围与开发分支交付完成。实现 / 验收`9c2b654`已普通推送，`ls-remote`核对远端完整哈希`9c2b654d32103eb2cf5c1f18fcca0c7d6913c8d3`，main仍`2574e99`；[本地预览](http://127.0.0.1:4173/?v=9c2b654)返回HTTP200，Codex打开请求返回queued。回执只更新本方案 / README / AGENTS三份文档，不重复已通过的类型 / 构建 / 112项测试或32份性能测量。下一步等待作者指定新范围；不发布、不自动续做其他体验组。

## 当前决定与范围

作者明确要求「不改变画质内容提升性能」，已授权测量、针对瓶颈修改、测试与本地预览。保留构图、场景物件、模型与纹理细节、灯光 / 阴影、天气 / 航行 / 猫动作及现有画质策略。优化重复计算、无效上传与资源准备，不通过降低分辨率、粒子数、动画更新频率或减少内容达成数字改善。不发布、不改main / docs或部署；原47项仍27 / 47且文件保持不变。

| 编号 | 是否修改 | 是否完成 | 当前步骤 / 下一步 |
| --- | --- | --- | --- |
| F00 同步与环境 | 是，建立本轮记录 | 是 | 工作区干净，fetch确认`03fa58b`与开发远端一致；共享Node24.14.0及现有依赖可用，新建独立开发分支 |
| F01 基准与剖析 | 测量原实现 | 是 | 原脚本7份基准、CPU4×完整动态9份逐帧样本、晴天 / 雷雨两个CPU profile及原始缓冲哈希已保存 |
| F02 等效优化 | 修改三处重复数学运算 | 是 | 7 / 7专项通过；240帧法线与Three逐字节一致，原24布料 / 20雨雪 / 4200海浪样本哈希一致；桌面 / 手机同帧法线替换零像素差 |
| F03 回归与成片 | 本轮验收 | 是 | 25个spec共112 / 112单次通过（包含首轮7项），无跳过 / flaky；类型 / 构建及生产9场景20图、原交互与暂停恢复通过 |
| F04 前后性能 | 匹配测量 | 是 | 原脚本14份加完整动态18份均完成；同机CPU4×三次中位更新CPU下降约48–54%，含渲染提交的总CPU下降约16–20%，资源 / DPR / 档位不变 |
| F05 文档与交付 | 开发分支 | 是 | 实现 / 验收9c2b654普通推送并核对远端，main保持；文档 / 历史 / 172个本地链接与范围检查通过，本地4173可访问，打开请求queued |

## 验证流程与边界

验证流程为：加载 → 清雾 → 第二次点击推门 → 同一房间画面 / 环境运动 → 看猫 / 阅读 → 返回及后台恢复；预期画质、内容和动作保持，CPU或无效工作减少。Browser plugin not available，按frontend-testing-debugging技能复用已安装Playwright与系统Chrome，不安装新浏览器或依赖。截图、profile与临时脚本保存在仓库外`~/.codex/visualizations/2026/11/12/render-performance`；仓库只保留维护文档、必要回归测试及汇总基准。

共享路径：`~/.nvm/versions/node/v24.14.0`、`~/.local/bin/project-node`、`~/.local/bin/project-pnpm`及`~/Library/pnpm/store/v11`；文档检查使用`~/.local/bin/document-python` / `~/.local/share/project-envs/document-tools`。沿用package与锁文件，不新建隔离环境。开始磁盘快照：仓库169,272KiB、共享store1,445,180KiB，完成后复测；启动前原5173 / 4173端口均未监听，本轮使用既有工具重启服务，临时防休眠有两小时时限，交付时停止。

F01实录：原测量脚本只调整外部副本的Playwright导入路径，晴昼 / 夜晚各3次与手机尺寸省电1次；另用固定CPU4× / 完整动态 / 风8m/s脚本，桌面晴昼、雷雨与手机尺寸雷雨省电各3次5秒。全部组内源码未变、GPU串行，普通270几何 / 42纹理 / 63程序，省电270 / 41 / 56；帧率约60 / 30由原刷新 / 节流限制。两个8秒CPU profile显示窗帘包含通用法线约1.19 / 1.21秒，雷雨粒子更新自耗时约.56秒；CPU海浪也在热点中。profile有剖析开销，不能直接作为前后计时结论。

原实现另外保存24个布料位置 / 法线状态、20个雨雪缓冲状态及4200个双精度海面样本SHA-256，作为本轮等效门槛。F02已编码并通过：`project-pnpm exec playwright test tests/curtain-wind.spec.ts tests/performance-equivalence.spec.ts --reporter=line,json`共7 / 7；另逐帧240帧直接对照Three原法线，桌面 / 手机尺寸在同一真实WebGL帧内替换法线均零像素差，并检查窗帘有实际可见像素，防止空画面对照。原数据固化在`tests/fixtures/render-equivalence.json`，不得随优化修改来隐藏差异。最终类型、扩大回归与构建也已通过，见F03；历史154项与约60FPS只作历史，不计入本轮。首次`project-pnpm run dev -- --host …`多传了分隔符，仅监听localhost；已停止并改用`project-pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort`，IPv4服务已核对，无依赖修改。

## F04 本轮同条件结果

当前Chrome157.0.8103.51 / ANGLE Metal M1 Pro、DPR1；普通1280×800与手机尺寸390×844省电，固定2026-10-31正午 / 风8m/s、无船鸟，完整动态、CPU4×、强制原画质且每组5秒、前后各三次。CPU是场景每帧更新和渲染提交的同步计时，不含GPU完成时间。

| 场景 | 更新CPU P50（三次中位，ms） | 全帧CPU P50（三次中位，ms） | 全帧CPU P95（三次中位，ms） |
| --- | ---: | ---: | ---: |
| 电脑晴昼 | 3.2→1.5（−53.1%） | 8.7→7.3（−16.1%） | 10.0→8.6 |
| 电脑雷雨 | 4.2→2.2（−47.6%） | 9.9→8.0（−19.2%） | 11.3→9.1 |
| 手机尺寸雷雨省电 | 3.7→1.7（−54.1%） | 7.5→6.0（−20.0%） | 8.7→6.9 |

18份完整动态与14份原脚本减少动态基准均无页面错误，资源普通270 / 42 / 63、省电270 / 41 / 56，DPR / 绘制 / 三角形保持。桌面仍约60FPS、手机尺寸省电约30FPS，受刷新率与原节流限制。提交P95有所波动（晴昼6.7→7.1ms、手机4.9→5.1ms），没有宣称GPU提速；表中是总CPU的实际结果。未测Safari、实体手机或长期温度 / 电池 / GPU显存。全部原始样本及测量脚本在上述外部证据目录，32份样本 / 每帧计时、前后source SHA-256、测试与生产记录汇总在[本轮JSON](benchmark/render-performance-2026-11-12.json)，指标说明见[性能记录](PERFORMANCE.md)。

## F03 验收实录

25个spec的112 / 112单次通过，无跳过、失败或flaky；包含首轮7项，不相加为119项。`project-pnpm run build`（内含`tsc --noEmit`）通过，Vite仍提示原Three分包超过500kB，未改分包或阈值。生产4173用完整动态复核：首次外部预览脚本沿用了expect默认5秒，短于原入室运动加静默时间，按钮尚未显示便失败；页面已正确进入房间、无页面错误。仅把外部脚本expect超时对齐90秒并保留首次日志 / 截图，没有缩短产品动画或改源码。随后9场景全部完成，20张最终图与整板已实际查看；扩大回归与性能结果不受该脚本超时影响，不重复运行已通过的112项。

生产覆盖电脑晴昼 / 晴夜 / 雷雨黄昏 / 雪天、手机尺寸390×844日 / 夜省电、320×568雨天、844×390阴天与正常访客入口；桌面和手机均实点看猫 / 抚摸 / 返回、开册 / 下一章 / 返回，检查阅读停止绘制；桌面另检后台暂停恢复、音乐暂停 / 继续、灯光开关 / 改色、实时 / 自由60倍切换。9场景无页面或console.error，无横向溢出 / 开发错误层；桌面开册观察到4条Chrome `glCopySubTextureCHROMIUM`复制警告，和既有交付记录同类，但本轮没有另跑原版生产开册作前后复验，不声称已消除或证明前后完全相同。最终图位于外部`production-*.png`（20张，不含首次失败截图），`production-preview.json`保存原始错误 / 警告 / 操作结果。

实际回归命令（复用共享稳定入口，行内包名 / 锁文件未改）：

```sh
~/.local/bin/project-pnpm run typecheck
~/.local/bin/project-pnpm exec playwright test \
  tests/curtain-wind.spec.ts tests/performance-equivalence.spec.ts \
  tests/curtain-environment.spec.ts tests/performance.spec.ts \
  tests/preparation.spec.ts tests/quality-policy.spec.ts \
  tests/wind-water.spec.ts tests/wind-vessels.spec.ts \
  tests/environment-weather.spec.ts tests/environment-controller.spec.ts \
  tests/environment-vessels.spec.ts tests/environment-integration.spec.ts \
  tests/pier-surf.spec.ts tests/seascape.spec.ts \
  tests/courtyard-fog.spec.ts tests/entry-motion.spec.ts tests/cat-focus.spec.ts \
  tests/book-transition.spec.ts tests/reader-duplex.spec.ts \
  tests/room-settings.spec.ts tests/room-entry-music.spec.ts \
  tests/room-overall.spec.ts tests/time-flow.spec.ts \
  tests/desk-clock.spec.ts tests/room-light.spec.ts --reporter=line,json
~/.local/bin/project-pnpm run build
~/.local/bin/project-pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort
```

完整动态 / 原脚本采样分别由外部`frames.mjs before|after`与`measure.mjs before|after`按上述条件运行；两个baseline profile只用于找瓶颈，不将剖析采样的开销算进性能收益。`aggregate.mjs`已核对32份样本、所有场景资源与档位、固定基准和当前source SHA-256，再写入JSON。必要测试只增加等效门槛与原法线对照，不为这三处数学调整扩大生产接口。

## F05 交付准备

完成验收后及交付前再次fetch，确认远端原开发分支仍`03fa58b` / main仍`2574e99`，没有另一端新增需整合。原47项、其他方案、package / 锁文件、构建 / 测试配置与docs逐字保持。当前仅三处运行时代码、三份测试 / 基准fixture、四份维护文档与一份性能JSON；`document-python ~/.codex/visualizations/2026/11/12/render-performance/check-docs.py`已核对172个本地链接、全部应用哈希 / 历史、112项 / 32份样本和精确11文件范围，`git diff --check`通过。

交付时最后一轮默认连接fetch遇HTTP/2 framing错误，HTTP/1.1重试又遇30秒低速超时；后续ls-remote已读到原分支不变。用GitHub另一个HTTPS地址做本次命令的解析覆盖、保留域名证书校验后，fetch、普通push和ls-remote均成功：仅命令级`-c http.curloptResolve=github.com:443:140.82.114.4 -c http.version=HTTP/1.1`，没有写系统DNS / Git全局配置，没有关闭TLS、force push或修改凭据。实现已上传为9c2b654，不把连接失败写成代码验收失败，也不把此前失败隐去。回执提交后使用`document-python ~/.codex/visualizations/2026/11/12/render-performance/check-docs.py --delivered`核对最终远端 / 历史 / source，文档变更无需重建应用。

环境没有安装、迁移或清理：实际Node24.14.0 / pnpm11.7.0，使用`~/.local/bin/project-node` / `project-pnpm`及`~/Library/pnpm/store/v11`，文档 / 拼图检查用`document-python`与共享document-tools。提交前磁盘快照仓库172,608KiB（相对开始169,272KiB为+3,336KiB，含可再生dist / test-results与新增验收数据），实现推送后172,904KiB（总变化+3,632KiB，约3.55MiB）；共享store始终1,445,180KiB（变化0）。没有新增隔离环境或例外，不把磁盘波动当作运行时收益；临时防休眠进程已停止（exit130），5173 / 4173服务保留。
