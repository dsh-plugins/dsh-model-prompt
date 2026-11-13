import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { compileMatch, matchesCandidates } from '../src/match.ts'

describe('compileMatch', () => {
  test('编译字符串数组', () => {
    const result = compileMatch(['^deepseek-flash$'])
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.patterns.length, 1)
  })

  test('拒绝缺失、非数组与空数组', () => {
    for (const value of [undefined, 'deepseek', {}, []]) {
      const result = compileMatch(value)
      assert.equal(result.ok, false, `${JSON.stringify(value)} 应被拒绝`)
    }
  })

  test('拒绝空白项与非字符串项', () => {
    for (const value of [['  '], [42]]) {
      const result = compileMatch(value)
      assert.equal(result.ok, false, `${JSON.stringify(value)} 应被拒绝`)
    }
  })

  test('非法正则整体拒绝并指出序号', () => {
    const result = compileMatch(['^ok$', '[未闭合'])
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.match(result.reason, /第 2 项/)
  })

  test('正则不带 flags，可反复求值', () => {
    const result = compileMatch(['deepseek'])
    assert.equal(result.ok, true)
    if (!result.ok) return
    const patterns = result.patterns
    assert.equal(matchesCandidates(patterns, ['deepseek-flash']), true)
    assert.equal(matchesCandidates(patterns, ['deepseek-flash']), true)
  })
})

describe('matchesCandidates', () => {
  const compiled = compileMatch(['^deepseek-flash$', '^mclans-gemini/'])
  if (!compiled.ok) throw new Error(compiled.reason)

  test('命中 model 候选', () => {
    assert.equal(matchesCandidates(compiled.patterns, ['deepseek-flash', 'mclans-deepseek/deepseek-flash']), true)
  })

  test('命中 provider/model 候选', () => {
    assert.equal(matchesCandidates(compiled.patterns, ['gemini-4-carbon', 'mclans-gemini/gemini-4-carbon']), true)
  })

  test('两个候选都未命中时返回 false', () => {
    assert.equal(matchesCandidates(compiled.patterns, ['grok-4.6', 'mclans-grok/grok-4.6']), false)
  })

  test('锚定 model 的正则不会被 provider/model 候选误命中', () => {
    assert.equal(matchesCandidates(compiled.patterns, ['deepseek-flash-ish', 'mclans-deepseek/deepseek-flash-ish']), false)
  })
})
