import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { contributionDigest, recoverBaselineDigest, sessionShowsContribution } from '../src/baseline.ts'
import type { SessionEventLike } from '../src/host'

/** 用序号到事件的映射构造表面读接口，模拟宿主 `surface.nodes` + `eventAt`。 */
function session(
  nodes: readonly number[],
  events: ReadonlyMap<number, SessionEventLike>,
): { surface: { nodes: readonly number[] }; eventAt(seq: number): SessionEventLike | undefined } {
  return { surface: { nodes }, eventAt: seq => events.get(seq) }
}

function pluginMessage(digest: string | undefined): SessionEventLike {
  return { type: 'user/message', data: { source: digest === undefined ? { kind: 'model-prompt' } : { kind: 'model-prompt', digest } } }
}

describe('contributionDigest', () => {
  test('相同文本得到相同摘要', () => {
    assert.equal(contributionDigest('同一段文本'), contributionDigest('同一段文本'))
  })

  test('不同文本得到不同摘要', () => {
    assert.notEqual(contributionDigest('甲'), contributionDigest('乙'))
  })

  test('输出为十六进制且不含原文', () => {
    const digest = contributionDigest('正文内容')
    assert.match(digest, /^[0-9a-f]{64}$/)
    assert.equal(digest.includes('正文'), false)
  })
})

describe('recoverBaselineDigest', () => {
  test('表面为空时返回 undefined', () => {
    assert.equal(recoverBaselineDigest(session([], new Map())), undefined)
  })

  test('取表面中最近一条本插件消息的摘要', () => {
    const events = new Map<number, SessionEventLike>([
      [1, pluginMessage('旧')],
      [2, { type: 'assistant/message', data: {} }],
      [3, pluginMessage('新')],
    ])
    assert.equal(recoverBaselineDigest(session([1, 2, 3], events)), '新')
  })

  test('只读表面节点，跳过已被压缩移除的事件', () => {
    const events = new Map<number, SessionEventLike>([
      [1, pluginMessage('已移除')],
      [2, pluginMessage('保留')],
    ])
    // 表面只剩 2：节点 1 已被压缩替换。
    assert.equal(recoverBaselineDigest(session([2], events)), '保留')
  })

  test('忽略其他来源的消息', () => {
    const events = new Map<number, SessionEventLike>([
      [1, { type: 'user/message', data: { source: { kind: 'user', digest: 'x' } } }],
      [2, { type: 'user/message', data: { source: { kind: 'agent-instructions' } } }],
    ])
    assert.equal(recoverBaselineDigest(session([1, 2], events)), undefined)
  })

  test('本插件消息缺 digest 时继续向前找', () => {
    const events = new Map<number, SessionEventLike>([
      [1, pluginMessage('更早')],
      [2, pluginMessage(undefined)],
    ])
    assert.equal(recoverBaselineDigest(session([1, 2], events)), '更早')
  })

  test('结构异常的消息不会抛错', () => {
    const events = new Map<number, SessionEventLike>([
      [1, { type: 'user/message', data: null }],
      [2, { type: 'user/message', data: { source: null } }],
      [3, pluginMessage('正常')],
    ])
    assert.equal(recoverBaselineDigest(session([1, 2, 3], events)), '正常')
  })

  test('eventAt 查不到序号时跳过该节点', () => {
    const events = new Map<number, SessionEventLike>([[1, pluginMessage('可用')]])
    assert.equal(recoverBaselineDigest(session([99, 1], events)), '可用')
  })
})

describe('sessionShowsContribution', () => {
  const contribution = '以下为当前模型 acme/m 的专用指导。'

  function systemMessage(text: string): SessionEventLike {
    return { type: 'system/message', data: { message: { content: [{ type: 'text', text }] } } }
  }

  const modelSection = { name: 'model-prompts', state: 'active', contentIndex: 0 } as const
  const otherSection = { name: 'example', state: 'active', contentIndex: 0 } as const

  function sectionMessage(
    content: readonly string[],
    source: {
      sections: readonly { name: string; state: 'active' | 'retired'; contentIndex?: number }[]
      reset?: true
    },
  ): SessionEventLike {
    return {
      type: 'system/message',
      data: {
        message: {
          content: content.map(text => ({ type: 'text', text })),
          source: { kind: 'system-prompt', ...source },
        },
      },
    }
  }

  test('其他段落增量更新后模型提示词仍然生效', () => {
    const events = new Map<number, SessionEventLike>([
      [1, sectionMessage([contribution], { sections: [modelSection] })],
      [2, sectionMessage(['其他段落的变更'], { sections: [otherSection] })],
      [3, sectionMessage([], { sections: [] })],
    ])
    assert.equal(sessionShowsContribution(session([1, 2, 3], events), contribution), true)
  })

  test('按内容索引检查模型段落的最新版本', () => {
    const events = new Map<number, SessionEventLike>([
      [1, sectionMessage([contribution], { sections: [modelSection] })],
      [2, sectionMessage([contribution, '模型提示词已更新'], {
        sections: [otherSection, { ...modelSection, contentIndex: 1 }],
      })],
    ])
    assert.equal(sessionShowsContribution(session([1, 2], events), contribution), false)
    assert.equal(sessionShowsContribution(session([1, 2], events), '模型提示词已更新'), true)
  })

  test('停用标记会使历史模型段落失效', () => {
    const events = new Map<number, SessionEventLike>([
      [1, sectionMessage([contribution], { sections: [modelSection] })],
      [2, sectionMessage([], { sections: [{ name: modelSection.name, state: 'retired' }] })],
    ])
    assert.equal(sessionShowsContribution(session([1, 2], events), contribution), false)
  })

  test('整份提示词被重置后仅使用重置时写入的段落', () => {
    const events = new Map<number, SessionEventLike>([
      [1, sectionMessage([contribution], { sections: [modelSection] })],
      [2, sectionMessage([], { sections: [], reset: true })],
      [3, sectionMessage([contribution], { sections: [modelSection], reset: true })],
    ])
    assert.equal(sessionShowsContribution(session([1, 2], events), contribution), false)
    assert.equal(sessionShowsContribution(session([1, 2, 3], events), contribution), true)
  })

  test('contributions 为空串时恒为 true', () => {
    assert.equal(sessionShowsContribution(session([], new Map()), ''), true)
  })

  test('最新系统消息已包含贡献时返回 true', () => {
    const events = new Map<number, SessionEventLike>([
      [1, systemMessage('旧内容')],
      [2, systemMessage(`开头\n\n${contribution}`)],
    ])
    assert.equal(sessionShowsContribution(session([1, 2], events), contribution), true)
  })

  test('插件缺席期间被重写为不含贡献的文本时返回 false', () => {
    const events = new Map<number, SessionEventLike>([[1, systemMessage('只剩其他段落')]])
    assert.equal(sessionShowsContribution(session([1], events), contribution), false)
  })

  test('跳过空文本的休眠节点，只看真正生效的那条', () => {
    const events = new Map<number, SessionEventLike>([
      [1, systemMessage(`开头\n\n${contribution}`)],
      [2, systemMessage('')],
    ])
    assert.equal(sessionShowsContribution(session([1, 2], events), contribution), true)
  })

  test('表面没有系统消息时返回 false', () => {
    const events = new Map<number, SessionEventLike>([[1, { type: 'user/message', data: {} }]])
    assert.equal(sessionShowsContribution(session([1], events), contribution), false)
  })

  test('结构异常的系统消息不会抛错', () => {
    const events = new Map<number, SessionEventLike>([
      [1, systemMessage(contribution)],
      [2, { type: 'system/message', data: null }],
    ])
    assert.equal(sessionShowsContribution(session([1, 2], events), contribution), true)
  })
})
