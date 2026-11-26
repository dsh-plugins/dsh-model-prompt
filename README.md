# dsh-model-prompt

`dsh-model-prompt` 从当前配置档、DSH 全局目录和 `~/.agents/model-prompts` 读取模型专属提示词，按会话或子代理实际选用的模型匹配并注入系统提示词。

## 功能

| 能力 | 说明 |
| --- | --- |
| 正则匹配 | 每个提示词文件用 frontmatter 的 `match` 声明正则，同时匹配 `model` 与 `provider/model`，任一命中即生效 |
| 多文件叠加 | 多个文件同时命中时按 `priority` 升序排列，同优先级按相对路径升序拼接 |
| 会话与子代理独立匹配 | 每次执行步骤前读取当前步骤的模型选择，根会话与子代理各自按自身使用的模型匹配提示词 |
| 模型切换时更新指导 | 匹配结果变化时更新系统提示词中的模型专属段落 |
| 跨设备同步 | `~/.agents/model-prompts` 可纳入 dotfiles，在多台设备上共享提示词 |
| 热更新 | 目录内文件变化后自动重新扫描，下一轮请求即应用新内容 |

## 安装

从 GitHub 源安装（已提交构建产物，无需授权构建脚本）：

```bash
dsh plugin --profile web add github:dsh-plugins/dsh-model-prompt
```

也可以克隆后按本地目录安装：

```bash
git clone https://github.com/dsh-plugins/dsh-model-prompt
dsh plugin --profile web add ./dsh-model-prompt
```

或在 DSH Web 的「插件」管理页安装。它是 Bundle，安装后自动挂载。

## 提示词目录

默认目录按优先级从高到低排列。

1. `<DSH_HOME>/profiles/<profile>/config/dsh-model-prompt/`
2. `<DSH_HOME>/profiles/<profile>/dsh-model-prompts/`
3. `<DSH_HOME>/config/dsh-model-prompt/`
4. `<DSH_HOME>/model-prompts/`
5. `~/.agents/model-prompts/`

`<profile>` 是本次启动使用的配置档。加载器跳过缺失的目录，递归读取 `.md` 文件，并跳过以 `.` 开头的子目录。同一相对路径只加载最靠前的有效文件，然后再按 `match` 筛选当前模型可用的提示词。不同相对路径的文件可以同时生效，按 `priority` 升序拼接，同值时按相对路径升序拼接。

## 提示词文件格式

每个文件必须带有 YAML frontmatter。

```markdown
---
match:
  - '^deepseek-flash$'
priority: 0
---
当前会话使用 DeepSeek Flash。回答技术问题时，明确区分已验证的事实与推测。
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `match` | 是 | 非空字符串数组，每项是正则表达式（`new RegExp(pattern)`，无 flags）。匹配候选为当前 `model` 与 `provider/model` 两个字符串 |
| `priority` | 否 | 有限数字，默认 `0`。数值越小越先拼接 |
| 正文 | 是 | frontmatter 之后的内容，trim 后注入 |

两个示例：

```markdown
---
match: ['^gemini-4-']
---
Gemini 4 系列支持多模态输入。先确认图片中的文字与图表内容，再给出结论。
```

```markdown
---
match:
  - '^mclans-gemini/'
  - '^gemini-4-carbon$'
priority: 10
---
（仅在 provider 为 mclans-gemini 或模型为 gemini-4-carbon 时生效）
```

单个文件体积上限默认为 64 KiB。遇到解析失败、正则表达式非法、正文为空或超出体积上限的文件时，加载器会跳过该文件，并在日志中记录具体原因与文件路径。

## 配置

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 置 `false` 时不注册任何资源 |
| `promptRoots` | string[] | 上述五级目录 | 显式设置时替换默认目录列表，按数组顺序确定优先级，仅展开开头的 `~/`。设为 `[]` 时跳过目录扫描 |
| `maxBytes` | number | `65536` | 单个文件字节上限 |
| `announce` | boolean | `true` | 是否在注入文本前附带"仅适用于当前模型"的声明头 |
| `watch` | boolean | `true` | 是否监听目录变化并热更新 |

配置写在 profile 的 `cordis.patch.yml` 中，按 `id` 匹配到 `model-prompt` 行并替换它的 `config`。补丁不与该行原有配置做深合并，但**缺失的键会由 schema 补上默认值**，因此只写你要改的那几项即可：

```yaml
- id: model-prompt
  config:
    maxBytes: 131072
```

上面这行只改单文件上限，其余键仍取默认值。

此前通过 `DSH_AGENTS_HOME` 指向自定义目录的用户，可通过 `promptRoots` 列出所需目录，并包含该自定义目录下的 `model-prompts`。

## 使用

### 在 Web 界面查看注入结果

提示词正文直接写进系统提示词，而 Web 界面的「上下文注入」列表只渲染 user 与 developer 消息，不会展示系统提示词段落。为了让注入状态可见，注入内容发生变化时还会额外写入一条摘要消息：

```text
当前模型 mclans-deepseek/deepseek-flash 的专用指导已注入系统提示词，来源：example-deepseek.md。
```

这条消息在对话流里显示为来源标签是 `model-prompt` 的「上下文注入」行，展开即可查看摘要正文。摘要只列出命中的来源文件名，不重复提示词全文，以免额外占用上下文预算。

### 跨设备同步

提示词目录是普通文件目录，把它纳入 dotfiles 即可跨设备复用：

```bash
# 示例：软链到版本库
ln -s ~/dotfiles/agents/model-prompts ~/.agents/model-prompts
```

## 行为与边界

- **注入位置**：注入内容位于系统提示词中部署 persona 之后、计划策略与工具说明之前。
- **空段落自动丢弃**：当前未选择模型或没有任何提示词文件命中时，该段落渲染为空，宿主会自动将其丢弃。
- **适用范围声明头** `announce` 设为 `true` 时，注入文本会声明适用的模型，并要求忽略历史中其他模型的专属指导。

## 实现说明

- **段落注册与插值隔离**：注入段落名为 `model-prompts`，`order` 为 `100`（排在部署 persona 之后、计划策略与工具说明之前）。正文按 `interpolate: false` 注入，文中的 `{{` 原样保留，不会被当作提示词变量插值。
- **段落更新与注入摘要** 插件在 `agent/pre-step` 中核对当前提示词的摘要和已生效的 `model-prompts` 段落。提示词发生变化或应生效的段落缺失时，插件请求开始新的请求系列，并在有匹配文件时写入一条注入摘要。核对分段事件时跳过其他段落的增量更新，并处理目标段落的停用和整份提示词的重置。旧版会话按最后一条非空系统消息核对正文。
- **基线恢复** 插件重载或会话恢复后，从当前会话最近一条 `model-prompt` 摘要消息的 `source.digest` 恢复上次注入的摘要。
- **热更新竞态防护**：目录监听使用单调递增的世代号标识每次扫描批次。即使慢速的旧批次扫描晚于新批次完成，也不会覆盖较新的快照。
- **生命周期与容错**：所有注册资源（提示词段落、`agent/pre-step` 监听、目录监听）均通过 `ctx.effect` 绑定，在插件卸载或热重载时自动回收。目录监听带有去抖窗口；若重新扫描失败，则保留上一份有效快照并在日志中记录失败原因。

## 开发

```bash
pnpm install
pnpm typecheck   # 宿主源码 + 测试源码类型检查
pnpm test        # 运行提示词解析、匹配、排序和目录优先级测试
pnpm build       # 输出 lib/
```
