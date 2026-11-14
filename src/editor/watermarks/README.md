# Image 水印素材

本目录当前361张透明WebP，共8,838,388B；保留原169张，本次从八组新源图补充192张独立变体，均从实际生成的图中裁切，不是SVG替代或第三方贴图。只由作者工作台引用；选中后以普通素材Blob保存，阅读 / 备份 / 内容包不依赖本目录或生成服务。

## 首批27张（历史）

- 生成日期：2026-11-13，北京时间；模型：`gpt-image-2`。
- 通道：本机已有`project-image` / `juapi-gpt-image-2`；没有新增网站AI接口或任何凭据。
- 原提示词：`生成这些还有更多水印：猫爪、小花、贝壳、星星、叶片。类似手帐本，可爱图案。`
- 请求透明背景，但服务实际返回1024×1024 RGB白底PNG。原图保存在`output/imagegen/album-watermarks.png`，SHA-256为`512096d9b4e172ea35b45803ce90b6225f2c332477107adfe9131dfaab25b0c4`。
- 用`scripts/prepare-watermarks.py`按记录坐标拆分、移除与外部相通的白底及相邻图案碎片，保留猫脸等闭合图案的白色内部。轮廓部分透明像素去白边，最长边最多240px、补6px透明边，编码无损WebP；没有用手绘图案替换生成内容。
- 图库包括猫爪 / 猫咪、五色花朵、三色贝壳、星星、枝叶、蝴蝶结与爱心。27张合计444,780B；逐张尺寸与SHA-256见`catalog.json`。
- 源图是AI生成素材，不冒称人工原创、扫描实物或第三方开放授权作品；未引入需要署名的外部图案。

使用共享环境重建派生图，无需安装依赖：

```sh
~/.local/bin/document-python scripts/prepare-watermarks.py
```

可选`--sheet /绝对路径/素材总览.png`生成供复看的联系表。脚本只处理本地文件，不调用模型或读取配置。编码器升级可能改变字节哈希；重建时须将图片与目录一起提交并重新验证。

## 2026-11-14 · 82款新变体

- 仍只使用共享`project-image` / `juapi-gpt-image-2` / `gpt-image-2`。七次实际生成，均请求透明背景、实际返回1024×1024 RGB白底PNG；原提示词逐字保存在[生成提示](../../../output/imagegen/watermark-variants-prompts.json)，没有附加风格约束或在线生成接口。
- 源图为`output/imagegen/watermark-variants-{cats,paws,flowers,seaside,stars,leaves,sentiments}.png`；输入SHA-256、实际裁切坐标、每张品类 / 原色 / 动作细节和旧27张标签记录在[scripts/watermark-variant-crops.json](../../../scripts/watermark-variant-crops.json)，派生图尺寸 / 输出SHA见本目录`catalog.json`。
- 新增猫咪10、猫爪8、花朵12、贝壳 / 海星12、星星12、枝叶12、蝴蝶结8 / 爱心8，共82。猫咪按插画外观分为虎斑、橘猫、黑白、白长毛、三花；动作 / 表情真实来自原图，不声称精确血统鉴定或任意品种 × 动作组合。
- 裁切先复用原外部白底 / 边缘去白处理，添加白边防止误删靠近图纸边缘的主图，再按连通轮廓移除相邻装饰，保留枝叶及肉垫必要分离部件，猫爪浅色轮廓另作7px闭合 / 内部白毛保留；最长边240px、6px透明边，无损WebP。已按联系表修正裁切过紧 / 邻图碎片和猫爪肉垫丢失。原27文件字节 / 哈希保持；编码器升级会影响派生字节，须同步验证目录。
- 每款的种类、原色、动作 / 表情 / 花纹等细节在图库可组合筛选；方向镜像、色相、饱和度、明亮度作为书页可选参数保存，原图字节不被调色覆写。滤色对整张图生效，不能独立换猫毛 / 领结。

重建82款变体（只替换本批键名，保留其余图案与顺序，不访问网络、不读配置）：

```sh
~/.local/bin/document-python scripts/prepare-watermark-variants.py
```

可选`--sheet /绝对路径/素材总览.png`。若需要从头重建，先运行旧脚本再运行本脚本；只运行旧脚本会将目录恢复到首批27张。开发期图片仅在作者工作台导入，阅读 / 翻页 / 实体捕获 / PNG / 备份和内容包使用各稿携带的普通素材，不依赖本目录标签。


## 2026-11-14 · 继续扩充60款

- 从上述七组已生成源图的未收录部分选取60款独立图案：猫爪8、花朵15、海边4、星星8、枝叶11、心意14。全库对应29 / 33 / 19 / 24 / 29 / 35款，旧109款文件、元数据及顺序逐一保留。不是对旧图作代码调色或镜像后作为新款。
- 本次也按作者要求发起八组新源图生成；两轮及单次核实均遭专用通道HTTP403额度不足，作者补充后重试仍未返回新图。请求提示与失败状态留在`output/imagegen/watermark-expansion-*`，没有把请求当作成功、没有切换其他供应商。实际新增60款只来自已存在的Image源图。
- 输入SHA、原109元数据整体SHA、每图裁切框 / 少量邻图排除矩形 / 白毛保留策略及实际标签见[scripts/watermark-expansion-crops.json](../../../scripts/watermark-expansion-crops.json)。[处理脚本](../../../scripts/prepare-watermark-expansion.py)复用外部去白底 / 轮廓处理，复看修正圆芽、星角和爪顶裁切、邻近星点；流星保留相连双色尾迹，虚线心路径保留分离笔画。最长边不超过252px（包括透明边），无损WebP，原文件字节不被滤色覆写。
- 重复运行只替换本批明确键，旧批重建脚本亦改为原位替换明确键；不会因重建82款而丢掉后来的60款。`--check`逐字节验证输出与目录、旧109元数据和哈希保持，不写文件。

```sh
~/.local/bin/document-python scripts/prepare-watermark-expansion.py
~/.local/bin/document-python scripts/prepare-watermark-expansion.py --check
```

如从全部源图完整重建，依次执行`prepare-watermarks.py`、`prepare-watermark-variants.py`、`prepare-watermark-expansion.py`；仅运行首批脚本仍会将目录退回27款。使用方法与生成受限状态见[本次实施记录](../../../WATERMARK-EXPANSION-PLAN.md)。


## 2026-11-14 · 新源图192款

- 专用图片通道核实成功后，八组实际源图全部返回（不是从旧图换色复制）：猫咪A / B、花朵、海边、星星、枝叶、蝴蝶结、爱心，均1024×1024，总10,690,207B。前次额度失败属于上节历史；本接续首次探测仍失败、再次核实成功后完成八组，记录见[生成回执](../../../output/imagegen/watermark-newsource-generation.json)。只使用共享project-image / gpt-image-2，没有网站AI接口，凭据只在本机技能配置。
- 本批新增猫咪53、花20、海边16、星24、枝叶29、心意50（领结20 / 爱心30）；全库六类82 / 53 / 35 / 48 / 58 / 85，总361款。旧169款元数据、顺序和文件字节保持。猫种标签仍按插画外观，不作血统鉴定。
- 原图保存在`output/imagegen/watermark-expansion-{cats-a,cats-b,flowers,seaside,stars,leaves,bows,hearts}.png`，输入SHA、实际标签、裁切框与邻图排除矩形见[本批清单](../../../scripts/watermark-newsource-crops.json)。猫咪B是原生透明RGBA：保留真实alpha / 白毛，不用去白底算法；其余RGB复用外部白底处理和必要的白毛闭合。对分离花瓣、星点、心环保留全部组件，按逐图边界清除邻图碎片。六类联系表逐项复看修正蝴蝶结尾部、海草 / 珊瑚、花枝和爱心边界。
- 新图共4,896,720B（约4.67MiB），无损WebP；尺寸 / 输出SHA见`catalog.json`。图库仅作者入口懒加载，默认访客不请求。共享调节、普通Blob存稿、备份 / 内容包与所有输出路径复用原功能，不新增模型字段或逐帧工作。

重建 / 核对本批（不访问网络或读取配置，只替换明确批次键）：

```sh
~/.local/bin/document-python scripts/prepare-watermark-expansion.py --spec scripts/watermark-newsource-crops.json
~/.local/bin/document-python scripts/prepare-watermark-expansion.py --spec scripts/watermark-newsource-crops.json --check
```

如从源图完整重建，依次首批27、82变体、默认60扩充，再执行上面的192批命令；只运行首批脚本会把目录退回27款。新批 / 60批`--check`及旧82批重建后362文件（361图＋目录）逐字节保持已核对。详细当前状态见[分步记录](../../../WATERMARK-EXPANSION-PLAN.md) Y00–Y03。
