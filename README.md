# dsh-model-prompt

按当前会话（或子代理）使用的模型匹配提示词文件，把匹配到的内容注入系统提示词。提示词文件放在跨设备同步的通用目录 `~/.agents/model-prompts`，不依赖 DSH 自身的配置档案。

## 功能

| 能力 | 说明 |
| --- | --- |
| 正则匹配 | 每个提示词文件用 frontmatter 的 `match` 声明正则，同时匹配 `model` 与 `provider/model`，任一命中即生效 |
| 多文件叠加 | 多个文件同时命中时按 `priority` 升序、同优先级按相对路径升序拼接 |
| 会话与子代理 | 注入点读取当前步骤的模型选择，根会话与子代理各自按自己的模型匹配 |
| 模型切换替换头部 | 匹配结果变化时通知宿主以新文本替换系统提示词头部，而不是追加一段过期内容 |
| 跨设备 | 提示词目录与 DSH 配置无关，纳入 dotfiles 同步即可在所有机器生效 |
| 热更新 | 文件变化后自动重扫，下一轮请求生效 |

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

或在 DSH Web 的「插件」管理页安装。本插件是 Bundle，安装后自动挂载。

## 提示词文件格式

目录默认是 `~/.agents/model-prompts`，递归读取其中所有 `.md` 文件（跳过以 `.` 开头的目录）。文件必须带 YAML frontmatter：

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

文件体积上限默认 64 KiB。解析失败、正则非法、正文为空、超过体积上限的文件会被跳过，并在日志中说明原因与文件路径。

## 配置

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 置 false 时不注册任何资源 |
| `promptRoots` | string[] | `['~/.agents/model-prompts']`（`DSH_AGENTS_HOME` 非空时前置其下 `model-prompts`） | 提示词根目录，仅展开开头的 `~/` |
| `maxBytes` | number | `65536` | 单个文件字节上限 |
| `announce` | boolean | `true` | 是否在注入文本前附带"仅适用于当前模型"的声明头 |
| `watch` | boolean | `true` | 是否监听目录变化并热更新 |

配置写在 profile 的 `cordis.patch.yml` 中，按 `id` 覆盖 `model-prompt` 行的 `config`（补丁是整行替换，需要写全要保留的键）：

```yaml
- id: model-prompt
  config:
    promptRoots:
      - '~/.agents/model-prompts'
    maxBytes: 65536
    announce: true
    watch: true
```

## 注入位置与行为

- 注入段落名为 `model-prompts`，`order` 为 `100`，位于部署 persona 之后、计划策略与工具说明之前。
- 正文按 `interpolate: false` 注入，文中的 `{{` 不会被当作提示词变量插值。
- 无模型选择或无匹配文件时该段落渲染为空，宿主自动丢弃。
- `announce` 为 true 时，注入文本以固定声明开头，说明适用范围；这样模型切换后历史里的旧段落也会被模型忽略。
- **头部替换**：插件监听 `agent/pre-step`，比较本次与前次贡献文本。文本变化时以 `startsRequestSeries: true` 让宿主把新提示词写回系统提示词头部并清空后续活动系统节点，避免追加语义留下过期指导。
- **基线恢复**：内存基线在插件重载、进程重启、会话恢复后都会丢失。插件从会话表面最近一条本插件摘要消息的 `source.digest` 恢复基线，因此重载不会重复写入摘要。日志只记录摘要而不记录注入全文，避免日志按「变化次数 × 注入体积」膨胀。日志里没有记录时以空串为基线，历史中可能残留的旧专用提示词会被一次头部替换清除。
- **热更新竞态**：目录监听用单调世代号标识扫描批次，迟到的旧扫描结果不会覆盖更新的快照。

## 在 Web 界面查看注入结果

正文写进系统提示词，而 Web 的「上下文注入」列表只渲染 user 与 developer 消息，系统提示词段落不会出现在列表里。因此插件在注入变化时额外写一条摘要消息：

```text
当前模型 mclans-deepseek/deepseek-flash 的专用指导已注入系统提示词，来源：example-deepseek.md。
```

它在对话流里显示为一条来源标签为 `model-prompt` 的「上下文注入」行，展开可见摘要正文。摘要只重复来源文件名，不重复正文，避免额外占用上下文预算。这条消息同时承担基线恢复的记录职责，其 `source.digest` 是注入全文的 SHA-256 摘要。

## 跨设备同步

提示词目录是普通文件目录，把它纳入 dotfiles 即可：

```bash
# 示例：软链到版本库
ln -s ~/dotfiles/agents/model-prompts ~/.agents/model-prompts
```

`DSH_AGENTS_HOME` 指向自定义 agents 根时，默认目录随之改变，便于与其他 agent 工具共用同一份提示词。

## 生命周期

所有注册（提示词段落、pre-step 监听、目录监听）都通过 `ctx.effect` 绑定，插件卸载或热重载时自动回收；目录监听使用去抖窗口，重扫失败时保留旧快照并在日志中记录原因。

## 开发

```bash
pnpm install
pnpm typecheck   # 宿主源码 + 测试源码类型检查
pnpm test        # 纯函数测试（frontmatter 解析、正则匹配、排序拼接、路径展开）
pnpm build       # 输出 lib/
```
