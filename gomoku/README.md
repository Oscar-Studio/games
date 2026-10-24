# 弈室 · 五子棋

从用户提供的 `yishi-source.zip` 集成，沿用训练模型、搜索引擎与木纹棋盘页面。

- 玩家对战：同一设备黑白双方轮流落子，无需模型。
- 对战 AI：默认模式，可选择下一局执黑或执白。
- 观战 AI：同一模型执黑白双方，支持暂停、继续与悔棋（悔棋后暂停）。
- 切换模式重新开局。进入任何模式均不会自动下载；AI 模式需点击右侧「下载模型」，约 28 MB（含推理引擎）。同一页面中已加载的模型可复用；通过校验的模型与引擎会写入 Cache Storage，刷新后优先读取。

在 games 根目录运行：

```sh
npm install
npm run dev:gomoku
npm run test:gomoku
npm run build
```

主站构建后自动单独构建此页面至 `dist/五子棋/`，原有游戏入口 URL 保持不变。资源路径相对此子目录，Web Worker 在用户点击下载后才创建。模型与推理引擎完整性通过 SHA-256 校验，第三方许可在 `public/licenses/`。

推理引擎以 `.js` 后缀发布，并显式指定 WASM glue 模块路径，以兼容生产 nginx 的 JavaScript MIME 映射。

兼容性：启动前检测 WebAssembly SIMD，不支持时保留玩家对战并提示系统升级，不下载引擎；缺少 Web Crypto 时使用 @noble/hashes 进行 SHA-256 校验（仍校验引擎与模型）。

## 云存储下载

引擎的两个 `runtime-f33595b9f7ea-*.bin` 分片与 `gomoku.onnx` 从 `https://gomoku-models-1387864538.cos.ap-guangzhou.myqcloud.com/` 根目录读取。COS 需允许游戏站 Origin 的跨域 GET。JS 模块、校验清单和许可证仍由游戏站提供，下载后继续验证 SHA-256。

`public/` 中保留三个二进制参考文件供本地测试使用，构建时不复制到 `dist/五子棋/`，部署不再上传它们。本地开发模式继续读取本地二进制，无需为 localhost 额外配置 COS 跨域规则。

## 本地二进制缓存

`binary-cache.ts` 使用 `yishi-binaries-v1` Cache Storage，分别保存完整引擎二进制和模型。缓存键包含 SHA-256，每次读取均校验大小与哈希；失效时只下载对应资源。当前版本成功落盘后清理同类旧版本，其他游戏缓存不受影响。写入失败、禁用存储或配额不足不影响当前在线加载。刷新后仍需点击加载按钮；页面脚本与小型版本清单继续正常联网获取，不代表全站离线可用。
