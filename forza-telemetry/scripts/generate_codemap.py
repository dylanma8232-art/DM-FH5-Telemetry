import os
import re

# Resolve directories relative to this script
script_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(script_dir)  # forza-telemetry/
base_dir = os.path.dirname(project_dir)      # Workspace root/

output_md = os.path.join(base_dir, "CODEMAP.md")

ignore_dirs = {
    'node_modules', '.git', '.codegraph', 'dist', 'data', '.DS_Store', 'build'
}

def scan_project(path):
    tree = {}
    file_info = {}
    
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        rel_root = os.path.relpath(root, project_dir)
        if rel_root == '.':
            rel_root = ''
            
        for f in files:
            if f.startswith('.') or f.endswith(('.png', '.ico', '.log', '.command', '.bak', '.tmp', '.swp')):
                continue
            
            filepath = os.path.join(root, f)
            rel_file_path = os.path.relpath(filepath, project_dir)
            
            exports = []
            if f.endswith(('.js', '.jsx')):
                try:
                    with open(filepath, 'r', encoding='utf-8') as file_obj:
                        content = file_obj.read()
                        
                        func_matches = re.findall(r'export\s+(?:async\s+)?function\s+(\w+)\s*\(', content)
                        exports.extend([f"函数/组件: `{fn}`" for fn in func_matches])
                        
                        const_matches = re.findall(r'export\s+const\s+(\w+)\s*=', content)
                        exports.extend([f"常量/方法: `{cn}`" for cn in const_matches])
                        
                        default_match = re.search(r'export\s+default\s+(?:function\s+)?(\w+)?', content)
                        if default_match:
                            def_name = default_match.group(1) or "默认导出"
                            exports.append(f"默认导出: `{def_name}`")
                except Exception:
                    pass
            
            parts = rel_file_path.split(os.sep)
            curr = tree
            for part in parts[:-1]:
                curr = curr.setdefault(part, {})
            curr[parts[-1]] = rel_file_path
            
            file_info[rel_file_path] = exports
            
    return tree, file_info

def render_tree(tree, file_info, level=0):
    lines = []
    indent = "  " * level
    for name, val in sorted(tree.items()):
        if isinstance(val, dict):
            lines.append(f"{indent}- 📂 **{name}/**")
            lines.extend(render_tree(val, file_info, level + 1))
        else:
            info = file_info.get(val, [])
            line = f"{indent}- 📄 [{name}](file:///forza-telemetry/{val})"
            if info:
                line += f"  *({', '.join(info)})*"
            lines.append(line)
    return lines

tree, file_info = scan_project(project_dir)
tree_lines = render_tree(tree, file_info)

codemap_content = f"""# FH5 遥测分析系统 - 代码知识图谱

该文件为项目的代码知识图谱导航页，供 AI 阅读本仓库代码时快速了解项目结构，减少上下文 Token 占用，避免盲目搜寻。

> [!NOTE]
> 本项目已使用 [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) 对代码进行了智能图谱初始化。
> 您可以在本地执行 `codegraph init` 开启实时语法关联索引，与 Agent 结对编程。

---

## 📂 项目模块结构树与导出分析

{chr(10).join(tree_lines)}

---

## ⚡ 核心组件功能概述

### 1. 网页客户端 (`forza-telemetry/client`)
* **`client/src/App.jsx`**: 网页入口，管理核心 Tab 路由（仪表盘、赛道、车辆、调校）并建立后台 WebSocket 数据监听。
* **`client/src/components/Header.jsx`**: 页眉控制器，展示双指示灯（Node 服务连接 & 游戏 UDP 遥测数据流），控制实时遥测录制及保存。
* **`client/src/components/pages/DashboardPage.jsx`**: 三栏式专业遥测大屏布局容器，组合展示下列核心卡片。
* **`client/src/components/dashboard/PaceNotesPanel.jsx`**: 拉力赛路书（Pace Notes）渲染器，支持弯道角度、推荐时速、刹车点提示以及即将到来的双弯叠加预告，内嵌语音播报模块。
* **`client/src/components/dashboard/AlertAdvicePanel.jsx`**: 警报与驾驶反馈中心。基于物理滑移率、悬挂行程及车速等参数，动态计算临界阈值以过滤误报。具备防误触降档（一档 TTS 预警）功能。
* **`client/src/components/dashboard/BrakingGripDynamicsPanel.jsx`**: 底盘监测面板。统一显示四个轮胎的详细滑移、胎温、行程、四轮差速以及 G 轴重力计。
* **`client/src/components/dashboard/RacePerformanceTimingPanel.jsx`**: 比赛时间与分段计时器（S1/S2/S3），支持计算实时 Delta（相较最快圈）以及展示最近 10 圈的历史纪录。

### 2. 后端服务端 (`forza-telemetry/server`)
* **`server/src/index.js`**: 主要的 API 服务端，启动 9188 端口 of Express/WebSocket 监听，接收 UDP 数据包，并管理赛道和录制文件的存取。
* **`server/src/telemetry-parser.js`**: Forza UDP 字节流解析器，根据官方结构体提取车速、引擎转速、胎温、轮速、重力、比赛状态（isRaceOn）等数据。
* **`server/src/speech-worker.js`**: 语音合成与下发接口。
* **`server/src/track-manager.js`**: 赛道曲线几何分析器，提取车辆行驶轨迹，通过曲线聚合重算赛道中线及检测弯道。

---

## 🛠️ 如何快速掌握此项目

如果您是第一次读取此项目的 AI Agent：
1. **主入口分析**：先看 [App.jsx](file:///forza-telemetry/client/src/App.jsx) 与 [index.js](file:///forza-telemetry/server/src/index.js)。
2. **遥测数据解析**：查看 [telemetry-parser.js](file:///forza-telemetry/server/src/telemetry-parser.js) 掌握遥测字节结构。
3. **数据关联**：使用 `codegraph_explore` 查看特定函数的上下文调用，尽量避免直接全量拉取组件文件。
"""

with open(output_md, 'w', encoding='utf-8') as f:
    f.write(codemap_content)

print("CODEMAP.md updated successfully relative to workspace!")
