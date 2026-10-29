# 放入音乐

初始曲目信息为 **《この星のどこかで》／由紀さおり・安田祥子**，即哆啦 A 梦剧场版《大雄的太阳王传说》的片尾曲。当前 `src/music-library.ts` 的 `source` 为空，仓库尚不包含这首歌的音频文件。

## 在页面中选择

入室后点击桌上的唱片机、右上角唱片按钮或“放入音乐”，选择设备上的音频文件。放入后点击唱片机可暂停或继续播放，进度会保留；“换一张唱片”可选择另一份文件。

本地选择只为当前页面创建文件地址，不上传、不保存到服务器。刷新页面后需重新选择。MP3、M4A、OGG、WAV、FLAC 等格式能否播放取决于浏览器支持，建议先使用 MP3 或 M4A。

阅读纪念册时音乐继续播放。切到后台会暂停，返回后再次点击唱片机继续；右上角静音同时控制音乐、海浪与猫咪声音。音乐播放时海浪会进一步轻下去。

## 固定为默认唱片

1. 将音频放入本目录，例如 `public/music/kono-hoshi-no-dokokade.mp3`。
2. 编辑 `src/music-library.ts`：

   ```ts
   export const initialRecord = {
     title: "この星のどこかで",
     artist: "由紀さおり・安田祥子",
     source: `${import.meta.env.BASE_URL}music/kono-hoshi-no-dokokade.mp3`,
   };
   ```

3. 运行 `npm run build`，将完整 `dist/` 更新到 `docs/`，再按仓库 README 的 GitHub Pages 步骤发布。

`BASE_URL` 保持开发预览和 `/memory/` 子路径下的资源地址正确。也可以将 `source` 填为可直接播放的音频 URL；浏览器必须能够访问该地址。默认唱片在用户点击后开始播放，进入网站时不会自动响起。

音乐由一个原生音频播放器加载，使用 `preload="none"`，不预先把整首歌曲解码到房间音效的 AudioContext。快速连续点击、更换音源、切到后台或关闭页面时，旧的播放请求不会在稍后重新开始。
