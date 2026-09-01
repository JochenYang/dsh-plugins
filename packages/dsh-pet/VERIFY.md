# 重启后验证清单（dsh-pet）

DSH 重启后按以下顺序检查。全部通过即完成。

## 1. 插件 bundle 已被 Web 应用加载

在 PowerShell 执行（端口换成当时 GUI 的端口，见系统提示或任务栏）：

```powershell
$r = Invoke-WebRequest -Uri 'http://127.0.0.1:10790/plugins/dsh-pet/client.js' -UseBasicParsing
$r.StatusCode   # 应为 200
```

对照：`/plugins/dsh-vision-bridge/client.js` 也应 200。404 说明应用还没重启。

## 2. 精灵图资源可达

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:10790/_dsh/pet/assets/atlas.json' -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest -Uri 'http://127.0.0.1:10790/_dsh/pet/assets/fox-atlas.png' -UseBasicParsing | Select-Object StatusCode
```

## 3. 页面表现

- 窗口右下角出现小狐狸（默认 120px、待机动画 4/5/6 帧循环）
- 无任何会话时：宠物睡觉（趴卧帧 22-25）
- 拖动宠物：跟随鼠标，松手吸附四角或保存自由位置（刷新后位置不变）
- 设置 → 宠物 页：出现全部选项（启用/大小/透明度/速度/停靠/情绪开关/帧映射）

## 4. 情绪动画触发

1. 在会话里发一条消息：
   - 流式输出期间 → 思考动画（帧 16-18）
   - 回复完成 → 按内容情绪：打招呼→挥手(11,8)，积极→开心(7,8,11)，道歉/出错→难过(10)
   - 气泡显示回复前 120 字，6 秒后消失
2. 触发一个工具报错或让回复出错 → 难过动画
3. 停止发消息约 5 秒 → 回落待机

## 5. 故障排查

- 浏览器 DevTools 控制台应有：`dsh-pet: overlay + settings section registered`
- 若宠物不显示：检查控制台是否有 `slot entry crashed in 'shell.overlay'` 或 `dsh-pet` 相关报错，把报错贴回来
- 若设置页没有"宠物"项：检查 `settings.section` 注册报错

## 版本

当前安装：0.2.5（默认映射：idle=4,5,6 happy=7,8,11 sad=10 think=16,17,18 sleep=22,23,24,25 wave=11,8；0.2.5 起适配 DSH 0.1.2-alpha 内核会话事件流）
