import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { resolveRoots, scanPromptRoots } from '../src/scan.ts'

test('展开 ~/ 前缀并拼接 home', () => {
  assert.deepEqual(
    resolveRoots(['~/agents/model-prompts'], '/home/me'),
    [path.join('/home/me', 'agents/model-prompts')],
  )
})

test('非 ~/ 前缀保持原样', () => {
  assert.deepEqual(resolveRoots(['/abs/root', 'relative/root'], '/home/me'), ['/abs/root', 'relative/root'])
})

test('仅展开开头，正文中的 ~ 不受影响', () => {
  assert.deepEqual(resolveRoots(['/abs/~dir'], '/home/me'), ['/abs/~dir'])
})

test('去重后保持首次出现的顺序', () => {
  assert.deepEqual(
    resolveRoots(['~/p', '/other', '~/p'], '/home/me'),
    [path.join('/home/me', 'p'), '/other'],
  )
})

test('同一相对路径采用首个有效提示词，其他路径仍可同时加载', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-model-prompt-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const profile = path.join(directory, 'profile')
  const shared = path.join(directory, 'shared')
  await Promise.all([
    mkdir(path.join(profile, 'providers'), { recursive: true }),
    mkdir(path.join(shared, 'providers'), { recursive: true }),
  ])
  const frontmatter = "---\nmatch: ['^example$']\n---\n"
  const override = path.join(profile, 'providers', 'example.md')
  await Promise.all([
    writeFile(override, `${frontmatter}配置档提示词`),
    writeFile(path.join(shared, 'providers', 'example.md'), `${frontmatter}全局提示词`),
    writeFile(path.join(shared, 'example.md'), `${frontmatter}补充提示词`),
  ])
  const scan = async () => {
    const snapshot = await scanPromptRoots([profile, shared], 65536, () => {})
    return snapshot.entries.map(({ relativePath, body }) => [relativePath, body]).sort()
  }

  assert.deepEqual(await scan(), [
    ['example.md', '补充提示词'],
    ['providers/example.md', '配置档提示词'],
  ])

  await writeFile(override, '缺少 frontmatter')
  assert.deepEqual(await scan(), [
    ['example.md', '补充提示词'],
    ['providers/example.md', '全局提示词'],
  ])
})
