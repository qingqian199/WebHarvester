# 贡献指南

## 分支策略

```
main        ← 生产分支，受保护，禁止直接提交
  └─ develop      ← 开发集成分支（可选）
       ├─ feature/*    ← 新功能分支
       ├─ fix/*        ← 缺陷修复分支
       └─ refactor/*   ← 重构分支
```

- **`main`**：生产就绪代码。**禁止直接提交**，必须通过 Pull Request 合并。
- **`feature/<name>`**：新功能开发。完成后合并回 `main`。
- **`fix/<name>`**：Bug 修复。完成后合并回 `main`。
- **`refactor/<name>`**：重构。不改变功能行为，只改进代码质量。

## 提交信息规范

所有提交必须遵循 **Conventional Commits** 格式：

```
<type>: <简短描述>

<可选详细描述>
```

类型说明：
- `feat`: 新功能
- `fix`: 缺陷修复
- `refactor`: 重构（无功能变更）
- `docs`: 文档
- `test`: 测试
- `chore`: 构建、工具、CI 配置

示例：
```
feat: 新增扫码登录模式（菜单选项4）
fix: 会话验证超时 - 改用 domcontentloaded 替代 networkidle
refactor: 消除内联 magic numbers，命名常量覆盖全项目
test: HarvesterService 单元测试（16 个用例，100% 行覆盖）
docs: 核心公共 API 添加 JSDoc 注释
chore: 迁移 ESLint 到 eslint.config.js（ESLint 9 flat config）
```

## 提交前检查

在提交代码前，请确保：

```bash
npm run lint          # ESLint 检查，必须 0 errors
npx tsc --noEmit     # TypeScript 类型检查，必须 0 errors
npm test              # 单元测试，必须全部通过
npm run test:e2e      # E2E 测试（可选，但推荐）
```

## 分支保护规则

在 GitHub 仓库设置中启用以下规则（Settings → Branches → Add rule）：

1. **Branch name pattern**: `main`
2. **Require a pull request before merging**: 勾选
3. **Require approvals**: 至少 1 人（如有多人协作）
4. **Require status checks to pass before merging**: 勾选
   - `Lint`、`Type check`、`Run tests`、`Build`
5. **Include administrators**: 建议勾选

## 代码风格

- 遵循 ESLint 配置（flat config）
- 公共 API 必须添加 JSDoc 注释（入参、出参、异常）
- 禁止硬编码密钥、密码、Token
- 避免引入新的第三方依赖

## 项目结构

```
src/
├── core/ports/         # 端口接口定义
├── core/services/      # 核心业务逻辑
├── core/rules/         # 规则引擎（纯函数）
├── core/models.ts      # 数据模型
├── adapters/           # 适配器实现
├── services/           # 组合服务
├── cli/                # 命令行界面
├── web/                # Web 面板
└── utils/              # 工具函数
tests/e2e/              # 端到端测试
docs/adr/               # 架构决策记录
```
