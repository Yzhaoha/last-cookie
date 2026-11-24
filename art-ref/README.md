# 角色图（ChatGPT 生成，2026-11-24）

用户 11-24 决定：这些 AI 图**可以直接用**（商店卡片、头像、封面等平面位置）。局内角色仍是代码搭的 3D，照这些图做简化版。
用了 AI 图，所以平台表单里 AI 相关选项**由用户自己勾**，会话不替他选。

ChatGPT 对话：用户账号里标题为「Cartoon Snack Characters」的那个，补图回这个对话，风格才一致。

| 文件 | 内容 |
|---|---|
| `last-cookie-ref-01-salty-8.png` | 咸味 8 个（左→右）：汉堡、披萨、热狗、薯条、爆米花、饭团、饺子、寿司。全都带腮红、怒脸偏多（用户说挺好，可用） |
| `last-cookie-ref-02-dessert-5.png` | 甜点重做 5 个：巧克力甜甜圈（不服）、墨镜杯子蛋糕（酷）、紫马卡龙（奸笑）、布丁（暴躁）、薄荷冰淇淋（开心，唯一带腮红） |
| `last-cookie-ref-03-new-8.png` | 新角色 8 个：墨镜塔可（嚣张）、杯面（懒）、头巾炸鸡腿（勇猛）、荷包蛋（紧张冒汗）、皇冠白胡子包子（长老）、蝴蝶结牛角包（傲娇）、墨镜珍珠奶茶（佛系）、西瓜片（疯） |

一共 21 种外形。每张图 2172×724，一排角色，浅色底，要做单个卡片得自己裁。

## 商店美术 `shop/`（2026-11-24，可直接进游戏用）

| 目录 | 内容 |
|---|---|
| `shop/characters/` | 21 个角色卡片，512×512 透明底、角色居中。每个两张：`名字.png` 彩色（已解锁）、`名字-locked.png` 深棕剪影（未解锁） |
| `shop/characters-1024/` | 同样 21 个角色的 1024×1024 高清彩色版（做大图、宣传用） |
| `shop/ui/` | 256×256 透明底图标：`box` 盲盒、`box-open` 盲盒打开发光、`coin` 饼干币、`coins` 一摞饼干币、`lock` 锁、`star` 星星 |
| `shop/preview.png` | 总预览（浅蓝底只是预览用） |

角色文件名：burger 汉堡、pizza 披萨、hotdog 热狗、fries 薯条、popcorn 爆米花、onigiri 饭团、dumpling 饺子、sushi 寿司、donut 甜甜圈、cupcake 杯子蛋糕、macaron 马卡龙、pudding 布丁、icecream 冰淇淋、taco 塔可、noodlecup 杯面、drumstick 炸鸡腿、friedegg 荷包蛋、baozi 包子、croissant 牛角包、bubbletea 珍珠奶茶、watermelon 西瓜。

做法：每个角色让 ChatGPT 照上面三张原图单独画一张大图（约 1250px，纯奶油色底、无地面阴影），再在本机抠成透明底。别用 ChatGPT 的「透明背景」模式重出——用户试过，明暗变浅、没质感。
