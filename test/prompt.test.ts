import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { compareEntries, promptNotice, renderPrompt, selectEntries } from '../src/prompt.ts'
import type { PromptEntry, PromptSnapshot } from '../src/prompt.ts'

function entry(relativePath: string, source: string, priority = 0): PromptEntry {
  return { relativePath, patterns: [new RegExp(source)], priority, body: `正文-${relativePath}` }
}

function snapshot(...entries: PromptEntry[]): PromptSnapshot {
  return { entries }
}

describe('selectEntries', () => {
  test('priority 小者在前，同优先级按路径升序', () => {
    const result = selectEntries(snapshot(
      entry('b.md', '^gemini', 10),
      entry('a.md', '^gemini', 10),
      entry('z.md', '^gemini', -5),
    ), { provider: 'p', model: 'gemini-4-carbon' })
    assert.deepEqual(result.map(item => item.relativePath), ['z.md', 'a.md', 'b.md'])
  })

  test('按 model 与 provider/model 两种候选匹配', () => {
    const result = selectEntries(snapshot(
      entry('by-model.md', '^gemini-4-carbon$'),
      entry('by-route.md', '^acme/gemini-4-'),
      entry('other.md', '^deepseek'),
    ), { provider: 'acme', model: 'gemini-4-carbon' })
    assert.deepEqual(result.map(item => item.relativePath), ['by-route.md', 'by-model.md'].sort())
  })

  test('无匹配返回空数组', () => {
    const result = selectEntries(snapshot(entry('a.md', '^deepseek')), { provider: 'p', model: 'gemini-4-carbon' })
    assert.equal(result.length, 0)
  })
})

describe('compareEntries', () => {
  test('优先级差值决定顺序', () => {
    assert.ok(compareEntries(entry('a.md', 'x', 1), entry('b.md', 'x', 5)) < 0)
  })

  test('同优先级比较路径', () => {
    assert.ok(compareEntries(entry('a.md', 'x'), entry('b.md', 'x')) < 0)
    assert.equal(compareEntries(entry('a.md', 'x'), entry('a.md', 'x')), 0)
  })
})

describe('renderPrompt', () => {
  const gemini = { provider: 'acme', model: 'gemini-4-carbon' }

  test('无模型选择返回空串', () => {
    assert.equal(renderPrompt(snapshot(entry('a.md', '^gemini')), undefined, true), '')
  })

  test('无匹配文件返回空串', () => {
    assert.equal(renderPrompt(snapshot(entry('a.md', '^deepseek')), gemini, true), '')
  })

  test('announce 为 true 时带上声明头与目标模型', () => {
    const text = renderPrompt(snapshot(entry('a.md', '^gemini')), gemini, true)
    assert.match(text, /^以下为当前模型 acme\/gemini-4-carbon 的专用指导。/)
    assert.match(text, /忽略本段/)
    assert.match(text, /正文-a\.md$/)
  })

  test('announce 为 false 时只输出正文', () => {
    const text = renderPrompt(snapshot(entry('a.md', '^gemini')), gemini, false)
    assert.equal(text, '正文-a.md')
  })

  test('多个文件按顺序用空行拼接', () => {
    const text = renderPrompt(snapshot(
      entry('b.md', '^gemini', 10),
      entry('a.md', '^gemini', 10),
    ), gemini, false)
    assert.equal(text, '正文-a.md\n\n正文-b.md')
  })
})

describe('promptNotice', () => {
  const gemini = { provider: 'acme', model: 'gemini-4-carbon' }

  test('无匹配时返回 undefined', () => {
    assert.equal(promptNotice(snapshot(entry('a.md', '^deepseek')), gemini), undefined)
  })

  test('摘要包含 provider/model 与来源文件', () => {
    const notice = promptNotice(snapshot(entry('a.md', '^gemini', 10), entry('z.md', '^gemini', -5)), gemini)
    assert.ok(notice !== undefined)
    assert.match(notice.text, /acme\/gemini-4-carbon/)
    assert.deepEqual(notice.files, ['z.md', 'a.md'])
    assert.match(notice.text, /z\.md、a\.md/)
  })
})
