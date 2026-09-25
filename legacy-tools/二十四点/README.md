# 🎯 二十四点 · 牌桌版

> 用四张扑克牌，通过加减乘除算出 24。

## 🎮 玩法

- 牌堆位于桌面左上角，点击 / 点击「跳过」从牌堆抽 4 张牌到桌面中央
- 用鼠标将两张牌拖到下方 A / B 两个槽位
- 点击四个运算符按钮之一（+ − × ÷），下方手风琴面板展开算式预览，确认后两张牌合成为一张新牌（飞回桌面中央），新牌可作为下一次合成的素材
- 用完全部 4 张牌并合成出 24 即胜利，自动开始下一手

## ✨ 特点

- **真实扑克牌面**：使用 [hayeah/playing-cards-assets](https://github.com/hayeah/playing-cards-assets) 的 SVG 牌面（MIT 协议）
- **保证可解**：每次抽牌都会校验至少存在一组解
- **拖拽操作**：HTML5 Drag & Drop，桌面到槽位
- **合成动画**：两张牌叠在一起翻面，再翻回正面显示结果数字（支持分数中间值）
- **重置 / 跳过**：回到本轮最初四张，或重新抽牌

## 🛠️ 技术

纯 HTML + CSS + JavaScript，单文件可独立运行。

### 素材

扑克牌 SVG 来自 https://github.com/hayeah/playing-cards-assets （MIT License, Copyright (c) 2018 Howard Yeh）。原素材基于 code.google.com/p/vector-playing-cards/ （public domain）。

下载方式：

```bash
mkdir -p cards
for rank in ace 2 3 4 5 6 7 8 9 10; do
  for suit in clubs diamonds hearts spades; do
    curl -O "https://raw.githubusercontent.com/hayeah/playing-cards-assets/master/svg-cards/${rank}_of_${suit}.svg"
  done
done
```
