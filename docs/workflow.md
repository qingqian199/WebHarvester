# WebHarvester 高效工作流

## 核心原则

```
信息收集 → 分析 → 执行 → 验证
  70%        15%     10%     5%   时间分配
  工具        人力    批量    自动化
```

慢的根因只有一个：**信息不足就动手**。改一行代码，不知道会影响多少地方，于是不敢改、反复试。codegraph 解决的就是这个——动手前花 2 分钟看清全局。

### 验证过的案例

```
目标: 清理 BaseCrawler.ts 死代码

1. codegraph callers tryBrowserFallback  → 零调用者 ❌
2. codegraph callers quickCdpCheck       → 仅被 tryBrowserFallback 调用
3. codegraph callers getPageUrlForApi    → 仅被 tryBrowserFallback 调用
   → 暴露全死链: 3 个方法互相依赖但外部无人使用
4. grep 确认无其他引用
5. 一次性删除 3 个方法 (107 行) + 1 个 unused import
6. npx tsc --noEmit → 0 errors ✅

耗时: ~5 分钟。如果用 grep 逐个搜，至少漏掉 2 个。
```

---

## 一、标准流程（任何改动前）

### Step 1 — 理解影响范围（codegraph, 2 min）

```bash
# 1a. 看调用链
codegraph callers -p . "要改的符号"
codegraph callees -p . "要改的符号"
codegraph impact -p . "要改的符号"

# 1b. 看定义
codegraph query -p . "符号名"
```

### Step 2 — 辅助全局搜索（grep / ast-grep, 1 min）

```bash
# 文本搜索（非 AST 感知）
# PowerShell:
Get-ChildItem -Recurse -Filter "*.ts" src -Exclude "*__tests__*" | Select-String -Pattern "目标模式"

# AST 感知搜索（找完整语法节点）
# 用 ast_grep_search tool
```

### Step 3 — 批量修改（ast-grep, 1 min）

```bash
# 相同的表达式 → ast-grep 一条规则改所有
# 用 ast_grep_replace tool
```

### Step 4 — 验证

```bash
npx tsc --noEmit
npx jest --testPathPatterns="相关测试"
```

---

## 二、按场景选工具

| 场景 | 用 codegraph | 用 ast-grep | 用 grep | 用 sub-agent |
|------|-------------|-------------|---------|--------------|
| 改一个类的公共方法 | impact → 看所有子类/调用方 | — | — | — |
| 批量替换相同表达式 | — | ✅ 一条规则改所有文件 | — | — |
| 找未使用的代码 | callers → 零调用者 = 死代码 | — | — | — |
| 搜索文本模式 | symbol → 查定义 | — | ✅ 模糊搜索 | — |
| 大型独立任务 | — | — | — | ✅ 并发派发 |
| 重构接口 | ✅ impact → 先看影响再动手 | — | — | — |

### 反模式（不要这样）

```
❌ 写了一段分析没跑 codegraph → 漏了调用关系，改完编译失败
❌ 手动改了多个文件 → 应该用 ast-grep 一条规则批量替换
❌ sub-agent 派了 30 个独立修改的任务 → 每个要重新读文件上下文，不如自己批量做
❌ 同一份信息又 grep 又 ast-grep → 选一个就够了
```

---

## 三、具体操作模板

### 模板 A：改一个接口/类的签名

```bash
# 1. 看谁在用它
codegraph impact -p . "ClassName"
# → 看到所有受影响文件列表

# 2. 看具体调用方式
codegraph callers -p . "ClassName.methodName"

# 3. 批量改
# 用 ast_grep_replace 或直接编辑

# 4. 验证
npx tsc --noEmit
```

### 模板 B：批量替换相同模式

```bash
# 1. 先搜索确认
ast_grep_search("pattern", ...)
# → 确认数量

# 2. 批量替换
ast_grep_replace("old", "new", ..., dryRun=false)
# → 一条命令改所有

# 3. 验证
npx tsc --noEmit
```

### 模板 C：复杂多步改动

```bash
# 1. codegraph analysis → 看清全局
# 2. 拆成独立子任务（每次最多 2-3 个）
# 3. 简单机械的 → 自己做（ast-grep）
# 4. 独立但有判断的 → 派 sub-agent（每人任务 ≤5 处修改）
# 5. 验证汇总
```

### 模板 D：新功能开发

```bash
# 1. codegraph files → 看项目结构
# 2. codegraph query → 找同类实现
# 3. 看 2-3 个现有实现作为参考
# 4. 写代码（匹配已有模式）
# 5. 验证
```

---

## 四、Sub-agent 使用边界

| 适合派 sub-agent | 不适合 |
|-----------------|--------|
| 独立的研究/探索（explore/librarian） | 跨多个文件的修改（不如自己批量） |
| 需要外部知识的问题 | 需要深度代码上下文判断的问题 |
| 纯机械的代码生成 | 需要统一决策风格的问题 |

**经验法则**：如果一个 sub-agent 需要读 5 个以上文件才能做一个修改，还不如自己做。

### 反面案例

```
派 sub-agent 做 "as any 清理" (30+ 处修改)
→ 每个 as any 都需要读文件上下文做判断
→ 跑了 9 分钟还没完成，取消
→ 自己用 ast-grep 批量 + 手动 10 分钟搞定

结论: sub-agent 适合 "分析后汇报"，不适合 "分布式修改"。
      批量机械修改永远是自己用 ast-grep 做更快。
```

---

## 五、质量门禁（跑完必做）

```bash
# 1. 类型检查
npx tsc --noEmit

# 2. 相关测试
npx jest --testPathPatterns="模块名"

# 3. 最后一次确认
codegraph status -p .   # 索引仍然有效
```

少了任何一步，当前改动不算完成。
