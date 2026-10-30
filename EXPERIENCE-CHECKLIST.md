# 体验清单与验证入口

下表把产品要求对应到实现和验证，方便后续增加物件或修改镜头时回归。自动化浏览器使用真实 DOM、音频及 WebGL；状态失效用例使用可控渲染器，以覆盖难以稳定触发的取消时机。

| 范围 | 行为 | 验证入口 |
| --- | --- | --- |
| 首次进入 P0 | 散雾后明确显示推门状态、一次简短探索说明、无操作约六秒后的柔和提示 | `onboarding.spec.ts`；场景反馈与雾效果测试 |
| 物件交互 P0 | 悬停和触摸按下反馈、立即接受反馈、自然小猫动作、过渡期间防重复 | `onboarding.spec.ts`、`cat-petting.spec.ts`、`record-interaction.spec.ts` |
| 阅读 P1 | 正文与说明字号、单列滚动、统一切章语义、展开目录、返回后续读 | `reader-controller.spec.ts`、`layout-matrix.spec.ts`、`usability.spec.ts` |
| 声音 P1 | 明确音乐状态、可只听海浪、更换及静音反馈、当前浏览器保存说明 | `onboarding.spec.ts`、`record-music.spec.ts`、`record-storage.spec.ts`、`record-interaction.spec.ts` |
| 移动布局 P1 | 320×568、390×844、844×390、2560×1440 DPR 2，按钮触摸面积与遮挡 | `layout-matrix.spec.ts`；真实场景物件点击及小猫取景测试 |
| 画质与失败 P1 | 设备能力及持续慢帧自动省电、手动控制、WebGL 失败继续阅读和重试、减少动态与键盘 | `quality-policy.spec.ts`、`performance.spec.ts`、`usability.spec.ts` |
| 结构 P2 | 独立状态、DOM、声音与阅读控制；异步结果失效及清理 | `room-controller.spec.ts`、`reader-controller.spec.ts` 与各模块测试 |
| 性能 P2 | 静态资源预热、阅读及后台暂停、几何预算和可重复基准 | `performance.spec.ts`、`preparation.spec.ts`、`scripts/measure-performance.mjs` |

本轮共 46 项独立自动化用例通过，包含实际 WebGL 场景、原生音频播放、四种布局、异步故障与资源预算；TypeScript 和生产构建通过。性能基准及四倍 CPU 降速的手机尺寸实验均未记录页面异常。

物理中低端手机的加载速度、帧率、整机内存及触摸屏到画面的延迟尚需实机复核。尺寸模拟、SwiftShader 和 CPU 降速只作为实验环境证据，具体说明见 [PERFORMANCE.md](PERFORMANCE.md)。
