# 可可 Live2D 与桌面陪伴路线

## 当前状态

网页目前使用四张透明 PNG，通过 CSS 实现呼吸、轻摆、鼠标视差、表情切换和点击反馈。这是动画立绘回退层，不是真正的 Live2D 模型。

## 正式模型交付物

原画需要提供分层 PSD，至少拆分脸、眉眼、瞳孔、五组嘴形、前后发束、躯干、四肢、服装、吊坠与裙摆。Cubism 导出文件放入 `public/assets/live2d/koko/`：

- `koko.model3.json`
- `koko.moc3`
- 纹理 PNG
- `koko.physics3.json`
- 表情与动作文件

参数约定见同目录 `asset-contract.json`。前端渲染器应保留 `base`、`relieved`、`worried`、`sleepy` 四个业务表情名称，并在加载失败或低性能设备上回退到当前 PNG。

## 接入顺序

1. 在 Cubism Editor 完成眨眼、视线、口型、呼吸、头身转动和头发/裙摆物理。
2. 使用 Cubism Web SDK 在 `CharacterStage` 中加载 `koko.model3.json`。
3. 将心情、时间、回复流状态映射为表情、动作与口型事件。
4. 增加性能档位与 `prefers-reduced-motion` 支持。
5. 桌面版使用 Tauri 或 Electron 创建透明、置顶、可穿透的角色窗口；聊天和模型配置复用现有 Web UI。

## 桌面版注意事项

API Key 继续存放在本机安全存储，不打包进前端资源。窗口拖拽、点击穿透、系统托盘、开机启动和全局快捷键均应由桌面外壳实现，Live2D 模型与聊天状态保持独立，便于升级模型而不破坏存档。
