# dsh-model-prompt

不同模型在推理习惯、工具调用与输出格式上各有差异，混用多模型或派发子代理时往往需要针对模型补充特定约束。若把这些约束直接写进 DSH 配置档案，换机器或切换 profile 就得重新维护。`dsh-model-prompt` 从跨设备通用目录 `~/.agents/model-prompts` 读取提示词文件，按当前会话或子代理实际选用的模型匹配并注入系统提示词，让模型专属指导能随 dotfiles 同步，与 DSH 自身的配置档案解耦。

## 功能

| 能力 | 说明 |
| --- | --- |
| 正则匹配 | 每个提示词文件用 frontmatter 的 `match` 声明正则，同时匹配 `model` 与 `provider/model`，任一命中即生效 |
| 多文件叠加 | 多个文件同时命中时按 `priority` 升序排列，同优先级按相对路径升序拼接 |
| 会话与子代理独立匹配 | 每次执行步骤前读取当前步骤的模型选择，根会话与子代理各自按自身使用的模型匹配提示词 |
| 模型切换时替换头部 | 匹配结果变化时直接用新文本替换系统提示词头部，不以追加方式残留旧模型的过期指导 |
| 跨设备同步 | 提示词存放在独立于 DSH 配置的普通文件目录中，纳入 dotfiles 即可在所有设备上生效 |
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

## 提示词文件格式

目录默认是 `~/.agents/model-prompts`，加载器会递归读取其中所有 `.md` 文件，并跳过以 `.` 开头的目录。每个文件必须带有 YAML frontmatter：

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
| `promptRoots` | string[] | `['~/.agents/model-prompts']`（`DSH_AGENTS_HOME` 非空时前置其下 `model-prompts`） | 提示词根目录，仅展开开头的 `~/` |
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

注意不要无谓地显式写出 `promptRoots`。它的默认值会读取 `DSH_AGENTS_HOME`，一旦写死就固定成了那一个目录。

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

当环境变量 `DSH_AGENTS_HOME` 指向自定义 agents 根目录时，默认提示词目录也会随之改变，便于与其他 agent 工具共用同一份提示词。

## 行为与边界

- **注入位置**：注入内容位于系统提示词中部署 persona 之后、计划策略与工具说明之前。
- **空段落自动丢弃**：当前未选择模型或没有任何提示词文件命中时，该段落渲染为空，宿主会自动将其丢弃。
- **适用范围声明头**：`announce` 设为 `true` 时，注入文本开头会附带一段固定声明，点名这段指导属于哪个模型。正常切换模型时头部替换已经把旧段落清掉了，声明头兜的是替换没生效的路径——从父会话继承来的系统节点、恢复的旧日志，以及压缩后仍留在历史里段落。这类残留会被声明头明确判定为不适用。
- **模型切换时替换头部**：会话中途切换模型或提示词内容更新后，新的匹配结果会直接替换系统提示词头部，并清空后续活动的系统节点，不会把旧模型的专用指导留在当前请求中。

## 实现说明

- **段落注册与插值隔离**：注入段落名为 `model-prompts`，`order` 为 `100`（排在部署 persona 之后、计划策略与工具说明之前）。正文按 `interpolate: false` 注入，文中的 `{{` 原样保留，不会被当作提示词变量插值。
- **头部替换机制**：运行时监听 `agent/pre-step` 事件，对比本次与上一次的贡献文本。一旦文本变化，便设置 `startsRequestSeries: true`，由宿主将新提示词写回系统提示词头部并清空后续活动系统节点，避免追加语义残留过期内容。
- **基线恢复与摘要校验**：内存中的比较基线在插件重载、进程重启或会话恢复后都会丢失。对话流里的 `model-prompt` 摘要消息同时承担基线恢复职责，其 `source.digest` 字段保存了注入全文的 SHA-256 摘要。恢复时从当前会话表面最近一条该插件的摘要消息里读 `source.digest`，据此重建基线，因此重载后不会重复写入摘要；会话日志也只存摘要不存全文，避免体积按「变化次数 × 注入体积」膨胀。若日志中没有历史记录，则以空串为基线，历史中可能残留的旧专用提示词会在下一次头部替换时被清除。
- **热更新竞态防护**：目录监听使用单调递增的世代号标识每次扫描批次。即使慢速的旧批次扫描晚于新批次完成，也不会覆盖较新的快照。
- **生命周期与容错**：所有注册资源（提示词段落、`agent/pre-step` 监听、目录监听）均通过 `ctx.effect` 绑定，在插件卸载或热重载时自动回收。目录监听带有去抖窗口；若重新扫描失败，则保留上一份有效快照并在日志中记录失败原因。

## 开发

```bash
pnpm install
pnpm typecheck   # 宿主源码 + 测试源码类型检查
pnpm test        # 纯函数测试（frontmatter 解析、正则匹配、排序拼接、路径展开）
pnpm build       # 输出 lib/
```
