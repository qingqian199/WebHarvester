# WebHarvester v1.0.1
🚀 基于 Playwright + TypeScript 构建的企业级网页资产采集、逆向分析与安全审计工具

## 项目介绍
WebHarvester 是一款模块化、工程化、低硬件依赖的网页数据采集工具，专为前端逆向、接口分析、安全测试、自动化采集场景设计。

## 核心功能
- ✅ 全量网络请求抓包（HAR 标准导出）
- ✅ XHR / Fetch 智能过滤，自动识别业务 API
- ✅ 支持 Vue / React 单页应用（SPA）采集
- ✅ Cookie / LocalStorage / SessionStorage 全量快照
- ✅ DOM 元素、隐藏字段、授权令牌自动提取
- ✅ Markdown / CSV / JSON 多格式报告生成
- ✅ 内置安全审计、风险检测、敏感信息监测
- ✅ 真人行为模拟、浏览器指纹伪装、反检测
- ✅ 交互式 CLI + 可视化 Web 控制台
- ✅ 批量任务、会话持久化、配置化驱动
- ✅ Docker 容器化 + CI 自动化支持

## 技术栈
- TypeScript
- Playwright
- 模块化架构（端口-适配器模式）
- 工程化 Lint / 测试 / 构建体系

## 快速开始

### 环境要求
- Node.js >= 18.x
- npm >= 9.x
- 系统已安装 Chromium 依赖（或使用 npx playwright install 自动安装）

### 安装与运行
```bash
npm install
npx playwright install chromium
npm start
```

### 运行测试
```bash
npm test
```

### 构建与部署
```bash
npm run build        # 编译 TypeScript 到 dist/
npm run pkg-win      # 打包为 Windows 可执行文件
```

## 项目结构
```
.
├── src/
│   ├── adapters/     # 具体实现（浏览器、存储、日志等）
│   ├── core/         # 领域模型、端口、规则、服务
│   ├── services/     # 批量采集等组合服务
│   ├── utils/        # 工具函数、分析器、报告导出
│   ├── web/          # Web 可视化面板
│   └── cli/          # 命令行菜单
├── static/           # Web 面板前端静态文件
├── output/           # 采集报告输出目录
└── sessions/         # 持久化登录会话
```

## 版本
v1.0.1（稳定版，可生产使用）
