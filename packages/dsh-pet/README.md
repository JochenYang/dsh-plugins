# dsh-pet

DSH 桌面宠物：Q 版小狐狸悬浮在 DSH 窗口右下角（可拖拽调整），根据 LLM 回复的流式状态与内容情绪播放不同的序列帧动画（待机/开心/难过/思考/睡觉/挥手），设置项集成在 **DSH 设置 → 宠物** 页面。

## 安装

```sh
cd dsh-pet
pnpm install
pnpm run pack          # 产出 dsh-pet-0.1.0.tgz
dsh plugin --profile web add file:D:/codes/dsh-configure/dsh-pet/dsh-pet-0.1.0.tgz
# 重启 DSH Web profile 生效
```

## 设置

设置项（DSH 设置 → 宠物）：
- 启用开关、大小（40-400px）、透明度
- 位置：四角预设或自定义，直接拖拽宠物即可调整（持久化）
- 动画速度倍率
- 情绪反应开关：流式思考、完成情绪、出错难过、内容情感
- 各动画的帧编号（1-32，对应联系表编号；见 assets 下 animations.json）

## 组成

- 服务端（src/index.ts）：注册 settings 命名空间 `pet` + 静态资源路由 `/_dsh/pet/assets/*`
- 客户端（src/client/）：心情追踪器 + 浮层组件（拖拽/帧动画）+ 设置页组件
- 资源（assets/）：fox-atlas.png 全图、animations/ 各情绪帧条、animations.json 元数据
