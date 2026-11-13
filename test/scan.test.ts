import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveRoots } from '../src/scan.ts'

test('展开 ~/ 前缀并拼接 home', () => {
  assert.deepEqual(resolveRoots(['~/agents/model-prompts'], '/home/me'), ['/home/me/agents/model-prompts'])
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
    ['/home/me/p', '/other'],
  )
})
