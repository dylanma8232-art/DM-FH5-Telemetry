# DM- FH5遥测中台 🏎️💨
### 你的手机/副屏，秒变 MoTeC 级赛车仪表与 AI 赛道副驾
**Full-stack Telemetry Analytics, Multi-Display Racing HUD & AI Race Engineer for Forza Horizon 5**

---

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg?style=for-the-badge&logo=creative-commons)](LICENSE)
[![Forza Horizon 5](https://img.shields.io/badge/Game-Forza_Horizon_5-0078D4?style=for-the-badge&logo=xbox)](https://forza.net/)
[![Telemetry Stream](https://img.shields.io/badge/Protocol-UDP_324_Bytes_(30~60Hz)-green?style=for-the-badge)](UDP-DATA-FIELDS.md)
[![AI Coach](https://img.shields.io/badge/AI_Engineer-Qwen_DashScope-FF6F00?style=for-the-badge)](https://help.aliyun.com/document_detail/2712195.html)

---

> [!CAUTION]
> ### 🛑 严正反盗卖红线与免责声明
> 1. **全网免费开源，严禁商用**：本项目采用 **CC BY-NC-SA 4.0** 许可证。**严禁任何个人或商家在淘宝、闲鱼等渠道打包转卖**。如果你是花钱买的，请立即退款并向平台举报！
> 2. **非外挂合规声明**：仅只读监听游戏原生合法的 UDP 广播数据（324 字节），绝不读取或修改游戏内存与文件，安全防封。

---

## 💡 为什么你必须试试它？

| 痛点场景 | 传统游戏体验 | DM- FH5遥测中台 解决方案 |
|---|---|---|
| **视野被挡** | 按 T 键开游戏遥测，白花花的数据挡满挡风玻璃，根本看不清弯心 | **📱 手机 / iPad / 副屏无线显示**：立在方向盘或显示器前，50+ 赛车组件高刷呈现 |
| **玄学调校** | 过弯推头、甩尾不知道动哪根防倾杆，弹簧磅数全靠网上抄，换辆车又抓瞎 | **🤖 大模型 AI 调校工程师**：基于实测跑圈数据，明确告知“3号弯入弯推头，建议前防倾杆下调2格” |
| **跑图瞎跑** | 夜赛、大雾天或者自制新赛道，不知道下一个弯有多急，经常冲出赛道 | **🗺️ 自动赛道识别 + 拉力语音路书**：无需画线，自动提取弯心，语音提前报弯：“右急弯、接左全油通过” |
| **慢在哪不知道** | 盲目刷了几十圈，圈速遇到瓶颈，不知道刹车是踩早了还是踩晚了 | **📈 多圈重叠遥测复盘**：毫秒级对比速度、刹车点与油门开度曲线，一眼看出慢在哪里 |

---

## 📸 实机界面预览 (Screenshots)

### 1. 赛车动态仪表盘：媲美专业赛车手座舱
> 实时呈现转速光带、四轮瞬时载荷、悬挂压缩、四轮摩擦力极限圆（Friction Circle）与胎温热力图。

![Live Telemetry Dashboard](docs/screenshots/01-live-telemetry-dashboard.jpg)

### 2. 赛道地图与智能语音副驾：拉力级弯道预警
> 算法自动清洗三维轨迹、提取弯道弯心（Apex）与出入弯速度，并同步进行语音路书播报。

![Track Map and Replay](docs/screenshots/02-track-analysis-and-replay.jpg)

### 3. 调校工坊与 AI 赛车教练：数据说话，告别玄学
> 700+ 台全系车辆官方数据库，结合实测跑圈遥测，由大模型（Qwen）直接生成车队工程师级的调校报告。

![AI Race Engineer Workshop](docs/screenshots/03-ai-race-engineer-workshop.jpg)

---

## 🚀 3 步极速开跑

### 第 1 步：游戏内开启数据输出
在《地平线 5》设置 ➔ **HUD 与玩法** ➔ 滚到最底部：
* **数据输出 (Data Out)**：`开启 (ON)`
* **数据输出 IP (Data Out IP Address)**：填写电脑局域网 IP（本机玩填 `127.0.0.1`）
* **数据输出端口 (Data Out IP Port)**：填写 **`9996`**

---

### 第 2 步：一键运行服务
```bash
# 克隆仓库
git clone https://github.com/dylanma8232-art/DM-FH5-Telemetry.git
cd DM-FH5-Telemetry/forza-telemetry

# 安装并启动
npm run install:all
npm run build:client
npm start
```

---

### 第 3 步：副屏开启仪表
* **电脑副屏**：浏览器访问 `http://localhost:9188`
* **手机 / iPad**：同一 Wi-Fi 下访问 `http://你的电脑局域网IP:9188` 即可！

---

## ⚖️ 开源协议

本项目采用 **[CC BY-NC-SA 4.0](LICENSE)** 开源许可证。个人免费交流学习，**严禁任何形式的商业盈利与转卖**。
