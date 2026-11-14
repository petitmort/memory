# 同页多款水印与自然角度 · 2026-11-14

> 2026-11-14上线接续：作者随后明确要求「上传」，本方案已完成成果随发布`a26d55d`上线，包含[在线纪念手帐工作台](https://petitmort.github.io/memory/editor.html?v=a26d55d)。实际部署、403文件与线上交互验证见[PUBLISH-2026-11-14.md](PUBLISH-2026-11-14.md)；下文“不发布”和测试数字保留为该批开发历史。本机草稿未上传，换地址通过可编辑备份导入。

作者明确希望同一纸页由同主题的多种真实图案组成，橘猫 / 白猫 / 不同姿态可以并存，有些正放、有些角度不同；能够自行选择。本批基线4c3524e、独立codex/watermark-mix，实际实施 / 验收，不继续生成素材或代填个人内容，不发布。

| 步骤 | 是否修改 | 是否完成 | 当前状态 / 下一步 |
| --- | --- | --- | --- |
| M00 核查 / 设计与基线 | 是 | 是 | 干净基线、fetch与共享package / 锁 / 运行时、单款模型 / 渲染 / 异步选图 / 包引用已核查；记录本方案与匹配性能前测 |
| M01 可选混排模型与共享渲染 | 是 | 是 | 可选mix / 引用与有限数值校验、确定性逐枚排布、共享渲染、公开优化与关闭组合引用、备份ID重映射已接入；类型通过，实际输出验收见M03 |
| M02 多选与调节 | 是 | 是 | 多选 / 移除、自动转角 / 正放比例 / 逐款固定角度 / 重排、单款保留、异步并发选择与迟到保护已接入；类型通过，控件稳定 / 一次历史验收见M03 |
| M03 验收 / 性能与修正 | 是 | 是 | 100个唯一相关用例跨两轮通过，新增16项全过；类型 / 双构建、18生产图 / 四阅读尺寸 / PNG与实体捕获 / 双面翻页 / 房间往返、CPU4×匹配前后各三次及3猫负载三次完成；实际过程与限制见下 |
| M04 文档与开发分支交付 | 是 | 是 | 实现 / 验收020efbb已普通推送codex/watermark-mix并以ls-remote核对；README / 更新日志 / 使用说明 / AGENTS同步，最后仅文档 / 磁盘回执，不重复应用验收或发布 |

## 实施约定

- 不自动修改旧稿。仅在主动启用时写入可选mix字段；保留原单款图片、线条、排布 / 滤色与全部361生成图。真实橘猫 / 白猫等来自多张原图，整层色相仍是可选微调。
- 混排最多16款，点击图库可添加 / 移除，组合可跨分类。默认重复铺底；页角只有两处、单个只有一处，会明确提示，想展示更多款可增加密度 / 改铺底。
- 自动角度范围和正放比例共同控制，每款也可选固定角度（0°即正放）。角度变化不改变已选图案；“换一组排布”改变确定性种子。普通刷新 / 视口 / 输出均不重抽，不增加逐帧工作。
- 各素材进普通Blob / 草稿 / 备份和公开内容包；校验所有引用、数量与有限数值。关闭混排保留组合以便恢复。异步多选不因请求返回顺序漏图；失败保持已有组合，原图ID冲突不得覆盖。
- 不读写或重载作者标签页 / 草稿，所有浏览器验收用隔离上下文。原四章 / 原47项27 / 47、房间、published.json=null、依赖 / 锁、main / docs / 部署保持，不自动发布。

## 环境与验证入口

复用~/.local/bin/project-node（Node24.14.0）/ project-pnpm11.7.0、~/Library/pnpm/store/v11，document-python→~/.local/share/project-envs/document-tools。沿用5173 / 4173 / 4174及现有Playwright / 系统Chrome，Browser plugin not available。不安装依赖或新环境，无隔离例外。结束报告磁盘快照与实际限制。

原始证据目录：/Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix。新结果单独记录，不能沿用上批37 / 37或历史性能。

## M00–M02 实录

- 开始4c3524e，fetch后建立codex/watermark-mix；项目只有package-lock.json，保留原锁与已兼容依赖，不安装或迁移环境。类型检查`project-pnpm typecheck`通过。
- 前测`project-node <证据目录>/measure.mjs before 4 3`串行三次：相同12跨页 / 2400×1800照片 / 原猫爪 / 字体预载 / 1440×1000 / CPU4×，处理用时中位分别7.8 / 7.5 / 7.4ms，P95分别11.3 / 8.5 / 9.9ms；双RAF中位33.2 / 33.3 / 33.0ms。所测操作零Element / 图片 / 控件移除、长任务0；实际滑块8次逐值更新。原始before-cpu4.json保留。
- 多选使用同一意图epoch内独立pending，按捕获作用域追加最新组合，逆序返回不覆盖先返回款式；重复pending点击不重复导入。手动换模式 / 修改设置撤销旧意图，文档替换 / 删除页也拒绝迟到结果。catalog ID与原图字节冲突时保留原图、分配新ID，presetKey保持图库选中状态。
- 导入自有水印可加入启用的组合；关闭组合仍保留全部引用以支持备份与恢复。图案角度 / 固定角度显隐显式尊重hidden，滑块值不进入结构key；只在选款列表结构改变时重建设置，不在拖动时重建图片。

## M03 验收实录

- 首轮2spec：12 / 13通过，唯一失败来自测试用visibility隐藏某一款做像素对照；既有page-raster为捕获隐藏的阅读页会强制visibility=visible，因此不能使用该属性作为移除图案的对照。仅改测试用opacity=0，不改原捕获逻辑；追加自有图 / ID字节冲突 / 双面翻页专项后运行完整相关回归。
- 最终范围12spec / 100项，包括文档 / 草稿存储 / 内容包应用 / 工作台 / 流畅度 / 设计 / 水印 / 变体 / 混排 / 阅读 / 双面翻页 / 实体书转场；初轮12项为子集不能累加。

- 中间整批99项中98通过，双面新增测试未等待异步预览src而取到null；只给测试补等待，不改产品。复核时另发现自有水印超16款的失败提示可能被统一成功提示覆盖，已将容量检查移到提交前并补上限断言；追加文档替换后迟到选择测试。最终12spec / 100项独立再验，结果以最终JSON为准，不与前两轮累加。
- 最终12spec首轮99 / 100：新增16项全部通过，唯一失败是原reader-duplex小屏虚拟时钟 / resize用例未在虚拟2秒后推进章节，该用例在此前99项批次已通过；保持源码和测试不变立即重验完整reader-duplex 8 / 8通过。当前覆盖100个唯一相关用例跨两轮通过，不能写成一次100 / 100或107项。实录tests-final.json与tests-reader-recheck.json均保留；未据偶发时序失败修改原翻页体验。
- `project-pnpm typecheck`、`project-pnpm build`、`project-pnpm build:editor`通过；原Three大分包提示保留。生产4174从空稿复制既有示例到隔离草稿，实际点选四猫 / 固定0°和−19° / 自动转角34°与正放40%、32%透明度，18枚同页出现四款原图。保存后刷新、三个手机控件尺寸、四阅读尺寸、PNG、45° / 135°真实CSS翻页、私有3D开册 / 关闭 / 再开与4173默认访客均通过。
- 18张生产图已在contact sheet全部复看，另原尺寸复看PNG / 电脑阅读 / 混排控件 / 320px控件。水印不盖住正文层；所测尺寸无横向溢出、移除按钮≥44px。新增测试逐款透明度对照确认三种真实图在实体捕获中均有>500变化像素，所有旋转归零也产生>500变化像素；PNG为真实导出并复看，双面复制页保留相同素材与角度。
- 页面 / 控制台错误和失败请求均0。私有房间三次捕获出现6条、默认访客2条既有类型Chrome纹理复制警告，未隐去或误称没有警告；不影响本轮实际阅读往返。Safari、实体手机、长期设备与全历史库未测。

## 性能与资源

| 条件（各三次串行） | 处理用时中位数的中位 | 处理P95的中位 | 双RAF中位数的中位 | 双RAF P95的中位 |
| --- | --- | --- | --- | --- |
| before，原猫爪 / 相同照片 | 7.5ms | 9.9ms | 33.2ms | 36.5ms |
| after，相同单款与负载 | 7.0ms | 8.6ms | 33.1ms | 43.2ms |
| mixed，三猫原图 / 每页32枚 | 7.7ms | 8.6ms | 33.1ms | 34.4ms |

匹配前后与三猫负载分别记录，不能把第三行当作同负载提速。所有九次所测操作Element / 图片 / 控件移除均0、长任务0，滑块八次逐值响应且原图 / 原控件保持；生产闲置5秒0RAF / 0WebGL。双RAF P95在匹配后测有增大，未称所有指标改善。数值属于CPU4×实验室DOM操作 / 双RAF观察，不代表FPS、冷网络、物理手机、耗电或长期稳定性；小幅差异不作实机提速结论。

没有新素材 / 依赖 / 环境 / 3D资源 / 灯光或持续帧循环。混排只在设置变动时计算，图片通过原Blob / URL与生命周期复用；默认访客不下载361图作者图库，实测默认访客隔离通过。原图和目录、生成源图、锁 / 原四章 / 原47项27 / 47 / published=null / main / docs / 部署字节校验保持。完整原始运行与生产回执见[benchmark](benchmark/watermark-mix-2026-11-14.json)。

## 复现命令

```sh
~/.local/bin/project-pnpm typecheck
~/.local/bin/project-pnpm build
~/.local/bin/project-pnpm build:editor
PLAYWRIGHT_JSON_OUTPUT_FILE=/Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix/tests-final.json ~/.local/bin/project-pnpm test tests/album-watermark-mix.spec.ts tests/album-watermarks.spec.ts tests/album-watermark-variants.spec.ts tests/album-document.spec.ts tests/album-storage.spec.ts tests/album-content-package.spec.ts tests/album-editor.spec.ts tests/album-editor-smoothness.spec.ts tests/album-editor-design.spec.ts tests/album-reading.spec.ts tests/reader-duplex.spec.ts tests/book-transition.spec.ts --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=/Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix/tests-reader-recheck.json ~/.local/bin/project-pnpm test tests/reader-duplex.spec.ts --reporter=list,json
~/.local/bin/project-node /Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix/production-qa.mjs
~/.local/bin/project-node /Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix/measure.mjs before 4 3
~/.local/bin/project-node /Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix/measure.mjs after 4 3
~/.local/bin/project-node /Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix/measure.mjs mixed 4 3
~/.local/bin/document-python /Users/jiangyuhan/.codex/visualizations/2026/11/14/watermark-mix/check-docs.py
git diff --check
```

before命令已在源码修改前完成，之后不能用新源码重跑冒称原版。所有应用测试 / 预览只用独立context，不读写或刷新作者标签页。作者等原4174草稿显示已保存后，自行刷新[工作台](http://127.0.0.1:4174/editor.html)，再主动开启同页混用多款；不自动套用到现有草稿。


## M04 交付实录

- 交付前再次fetch成功，origin/codex/watermark-variants仍4c3524e、origin/main仍d9a4d3c；没有另一端新增需要整合。本批独立codex/watermark-mix，按普通推送交付，不修改main或Pages。
- 四份说明182本地链接、14变更文件范围、361原图哈希 / 原内容与锁 / main / docs / 部署字节检查、凭据扫描与git diff --check通过，最终源码 / 生产产物SHA快照已保存。
- 开始仓库256,712KiB；提交前259,332KiB（净+2,620KiB，含可再生构建 / 测试）；共享store1,445,180KiB不变。外部本批验收目录7,896KiB，包含原始报告、18生产图和对照图，不计入仓库变化。没有安装依赖、新建环境或隔离例外，全部复用上方共享路径；原5173 / 4173 / 4174服务保留。
- 实现 / 验收020efbb已普通推送codex/watermark-mix，ls-remote明确返回020efbb9b7bef446ae5672d3039aa5e5b3dcffc2；远端variants仍4c3524e、main仍d9a4d3c。实现提交后仓库259,596KiB，相对开始净+2,884KiB（含Git与可再生构建测试、未含最后回执对象），共享store仍1,445,180KiB。
- 最后回执仅README / AGENTS / 使用说明 / 本方案与benchmark交付元数据。源码与已验收产物SHA保持，最终四说明183本地链接通过，仅运行check-docs.py --delivered和git diff --check，不重建或重复已通过的应用验收；普通交付回执后核对远端。作者保存后自行刷新4174，原三端口保留，不读写作者草稿、不自动发布或推进其他组。
