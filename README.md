# 🎮 Oscar Studio Games

> 一些益智小游戏，在玩中学，在学中玩。

[![GitHub Repo](https://img.shields.io/badge/GitHub-OSCAR--Studio%2Fgames-blue?logo=github)](https://github.com/Oscar-Studio/games)
[![Netlify](https://img.shields.io/badge/在线访问-games.oscarstudio.cn-brightgreen?logo=netlify)](https://games.oscarstudio.cn)

---

## 📂 游戏列表

| 游戏 | 文件夹 | 简介 |
|------|--------|------|
| 🧊 2048 | [`2048/`](./2048) | 经典 2048 滑动合并游戏，数字爱好者必玩 |
| ♔ 国际象棋 | [`国际象棋/`](./国际象棋) | 经典国际象棋，支持王车易位、吃过路兵、兵升变 |
| ♟️ 五子棋 | [`五子棋/`](./五子棋) | 简约风格五子棋，人机对弈 |
| 🎴 单词翻翻乐 | [`单词翻翻乐/`](./单词翻翻乐) | 中英文单词记忆匹配游戏，支持自定义词库 |
| 🎯 二十四点 | [`二十四点/`](./二十四点) | 用4个数字通过加减乘除得到24 |
| ♟️ 中国象棋 | [`中国象棋/`](./中国象棋) | 中国象棋棋盘，支持双人同屏对弈 |
| ⚡ 技能五子棋 | [`技能五子棋/`](./技能五子棋) | 增强版五子棋，加入技能系统 |
| 🎯 罚分游戏 | [`罚分游戏/`](./罚分游戏) | 根据给出数字计算目标值，差值越大扣分越多 |
| 🔍 舒尔特方格 | [`舒尔特方格/`](./舒尔特方格) | 训练专注力和数字敏感度 |

---

## 🏗️ 项目结构

```
games/
├── index.html              # 入口页面（游戏选择器）
├── tools-config.json       # 游戏配置
├── user-auth.css / .js     # 用户认证样式与逻辑
├── 2048/
│   └── README.md           # 游戏说明
├── 五子棋/
│   └── README.md           # 游戏说明
└── ...
```

每个游戏均在独立文件夹中，可单独部署。

---

## 🌐 在线访问

**https://games.oscarstudio.cn**

---

## 📦 本地运行

```bash
# 任意 HTTP 服务器均可
python3 -m http.server 8080
# 或
npx serve .
```

---

*由 [Oscar Studio](https://oscarstudio.cn) 出品 · [查看主站 →](https://oscarstudio.cn)*
