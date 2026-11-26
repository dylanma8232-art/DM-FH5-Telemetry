<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/banner-light.png">
  <img alt="DM · FH5 Telemetry — Second-Screen Sim-Racing Dashboard & AI Pace-Note Co-Driver" src="assets/banner-dark.png" width="100%">
</picture>

<div align="center">

<p>
  <a href="README.md"><img alt="简体中文" src="https://img.shields.io/badge/语言-简体中文-2b2927?style=flat-square"></a>
  <a href="README_EN.md"><img alt="English" src="https://img.shields.io/badge/Language-English-c8521b?style=flat-square"></a>
  <img alt="Forza Horizon 5" src="https://img.shields.io/badge/Game-Forza_Horizon_5-0078D4?style=flat-square">
  <img alt="UDP 324B 60Hz" src="https://img.shields.io/badge/Telemetry-UDP_324B_%40_60Hz-2e7d32?style=flat-square">
  <img alt="AI Coach" src="https://img.shields.io/badge/AI_Coach-Qwen_DashScope-d97706?style=flat-square">
  <a href="LICENSE"><img alt="License: CC BY-NC-SA 4.0" src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-b45309?style=flat-square"></a>
</p>

[3-Step Quickstart](#3-step-quickstart) · [Live Screenshots](#live-screenshots) · [Why DM-FH5-Telemetry](#why-dm-fh5-telemetry) · [Safety & Fair Play](#license--fair-play-statement) · [中文文档](README.md)

</div>

---

## Why DM-FH5-Telemetry

Pushing lap times and dialing in setups in **Forza Horizon 5** usually runs into three frustrations:

- **In-game telemetry blocks the windshield**: Pressing `T` overlays raw white numbers right across your braking zones and apexes.
  - **Fix**: Offload **50+ high-refresh telemetry widgets** — G-force friction circle, suspension travel, tire temperature/pressure heatmaps, and pedal traces — onto a phone, iPad, or second monitor while keeping your main screen completely clean.
- **Blind guesswork in car tuning**: Downloaded tunes rarely fit your driving style, and fixing mid-corner understeer or snap oversteer by trial and error takes hours.
  - **Fix**: Backed by an **official 700+ car spec database + LLM AI Race Engineer**. Run 3 laps and get concrete, telemetry-backed setup prescriptions (e.g., *"Entry understeer in Turn 3 — soften front anti-roll bar by 2 clicks and add front downforce"*).
- **Missing braking points in night or fog stages**: Learning unfamiliar routes takes dozens of crashes, with no clear way to see where you lost 0.3s against your best lap.
  - **Fix**: Automatically extracts 3D track centerlines and apexes to deliver **real-time spoken rally pace notes**, paired with millisecond multi-lap speed trace overlays after the session.

---

## 3-Step Quickstart

### 1. Enable Native UDP Data Out in Forza Horizon 5

Open **Settings → HUD and Gameplay → scroll to the bottom**:
- **Data Out**: `ON`
- **Data Out IP Address**: `127.0.0.1` (if running on the same PC) or your PC's LAN IP
- **Data Out IP Port**: `9996`

### 2. Install & Start the Telemetry Hub

```bash
git clone https://github.com/dylanma8232-art/DM-FH5-Telemetry.git
cd DM-FH5-Telemetry/forza-telemetry

npm run install:all
npm run build:client
npm start
```

### 3. Open the Cockpit on Any Screen

- **Second monitor on PC**: `http://localhost:9188`
- **Phone / iPad on the same Wi-Fi**: `http://<YOUR_PC_LAN_IP>:9188`

> Optional AI Race Engineer: Copy `.env.example` to `.env` in the repo root and add a DashScope (Qwen) API key to enable post-stint AI setup diagnostics.

---

## Live Screenshots

<p align="center">
  <img src="assets/dashboard.jpg" alt="50+ widget real-time telemetry cockpit" width="100%">
  <br>
  <sub><b>Real-Time Second-Screen Cockpit</b>: RPM/gear, G-force friction circle, 4-corner tire temps & pressures, and throttle/brake traces</sub>
</p>

<table>
<tr>
<td width="50%" valign="top">
  <img src="assets/track.jpg" alt="3D Track Mapping & Automated Rally Pace Notes" width="100%">
  <br>
  <sub><b>Automated 3D Track Map & Rally Pace Notes</b>: Apex detection, entry/exit speeds, and live voice callouts</sub>
</td>
<td width="50%" valign="top">
  <img src="assets/tuning.jpg" alt="700+ Car Tuning Workshop & AI Race Engineer" width="100%">
  <br>
  <sub><b>Tuning Workshop & AI Race Engineer</b>: 700+ vehicle baselines combined with real telemetry for actionable suspension & aero adjustments</sub>
</td>
</tr>
</table>

---

## License & Fair-Play Statement

- **100% Read-Only & Safe**: Listens strictly to Forza Horizon 5's built-in 324-byte UDP telemetry broadcast. It **never reads, injects, or modifies game memory or files**, and carries zero ban risk.
- **License**: Released under **[CC BY-NC-SA 4.0](LICENSE)** for personal and community use. Commercial reselling or paid bundling is strictly prohibited.

---

## Author

Built by **[Dylan.ma](https://github.com/dylanma8232-art)** · [Explore more open-source tools & experiments →](https://github.com/dylanma8232-art?tab=repositories)
