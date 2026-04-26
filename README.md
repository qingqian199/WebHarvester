# WebHarvester 项目说明

## 项目简介
本项目是一款**工程化的 Web 逆向抓包与资产采集工具**，旨在兼容低硬件配置并提供模块化、可扩展的架构。

## 快速运行
```bash
npm install
npm run start      # 交互式单站点采集
npm run batch      # 批量任务采集（读取 tasks.json）
npm run web        # �启用可视化面板（http://localhost:3000）
```

## 关键特性
- **低硬件适配**：通过动态指纹、浏览器遮蔽等手段在低配机器上流畅运行。
- **模块化解耦**：核心层、适配层、工具层、业务层明确分层，便于维护和二次开发。
- **结构化日志**：统一 JSON 格式日志（`JsonLogger`），便于日志聚合平台采集。
- **安全沙箱**：执行用户脚本前会进行关键 API 替换，防止恶意代码泄露信息。
- **自动化输出**：支持 Markdown、CSV、HAR、AI 精简报告、Security Audit 报告等多种输出格式。
- **单元测试 + CI**：使用 Jest 编写测试，GitHub Actions 自动化执行 lint、build。
- **容器化**：提供轻量 Docker 镜像，`docker build` 即可部署。

## 项目结构（关键目录）
```
WebHarvester/
├─ src/
│  ├─ core/          # 核心业务模型、接口、服务
│  ├─ adapters/      # 浏览器、存储、会话等外部适配器实现
│  ├─ utils/         # 通用工具库（日志、常量、脚本沙箱等）
│  ├─ tests/         # 单元测试
│  └─ cli/           # 交互式 CLI 实现
├─ .eslintrc.json    # ESLint 配置
├─ jest.config.js    # Jest 配置
├─ Dockerfile        # Docker 镜像构建脚本
├─ package.json      # npm 配置及脚本
└─ README.md         # 项目文档
```

## 代码质量 & CI
- `npm run lint` 检查代码风格。
- `npm run test` 运行测试并生成覆盖报告。
- GitHub Actions 自动在每次 PR/Push 时执行 lint、build，确保代码质量。

## 联系 & 贡献
如需帮助或想贡献代码，请提交 Issue 或 Pull Request，欢迎一起完善！

---
*此文档随项目更新而迭代*