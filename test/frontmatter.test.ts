import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseFrontmatter, parsePriority } from '../src/frontmatter.ts'

describe('parseFrontmatter', () => {
  test('切出 YAML 数据与正文', () => {
    const result = parseFrontmatter('---\nmatch: ["a"]\n---\n正文\n第二行\n')
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.data, { match: ['a'] })
    assert.equal(result.body, '正文\n第二行\n')
  })

  test('兼容 CRLF 与 BOM', () => {
    const result = parseFrontmatter('\uFEFF---\r\nmatch: ["a"]\r\n---\r\n正文\r\n')
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.data, { match: ['a'] })
    assert.equal(result.body.trim(), '正文')
  })

  test('行尾空白不影响围栏识别', () => {
    const result = parseFrontmatter('---   \nmatch: ["a"]\n---  \n正文\n')
    assert.equal(result.ok, true)
  })

  test('缺少首行围栏时拒绝', () => {
    const result = parseFrontmatter('# 标题\n---\nmatch: ["a"]\n---\n')
    assert.equal(result.ok, false)
  })

  test('缺少闭合围栏时拒绝', () => {
    const result = parseFrontmatter('---\nmatch: ["a"]\n正文没有闭合\n')
    assert.equal(result.ok, false)
  })

  test('YAML 语法错误时拒绝并给出原因', () => {
    const result = parseFrontmatter('---\nmatch: [未闭合\n---\n正文\n')
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.match(result.reason, /不是合法 YAML/)
  })

  test('正文中的分隔线不当作闭合围栏之外的额外分割', () => {
    const result = parseFrontmatter('---\nmatch: ["a"]\n---\n第一段\n\n---\n\n第二段\n')
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.body.trim(), '第一段\n\n---\n\n第二段')
  })
})

describe('parsePriority', () => {
  test('缺省为 0', () => {
    assert.deepEqual(parsePriority(undefined), { ok: true, value: 0 })
  })

  test('接受负数与小数', () => {
    assert.deepEqual(parsePriority(-5), { ok: true, value: -5 })
    assert.deepEqual(parsePriority(1.5), { ok: true, value: 1.5 })
  })

  test('拒绝非数字与非有限数字', () => {
    for (const value of ['10', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = parsePriority(value)
      assert.equal(result.ok, false, `${String(value)} 应被拒绝`)
    }
  })
})
