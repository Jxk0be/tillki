import { describe, expect, it } from 'vitest'
import { formatCents, formatSignedCents, parseMoneyToCents } from '../money'

describe('parseMoneyToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['$12.50', 1250],
    ['$1,234.56', 123456],
    ['1,234', 123400],
    ['0', 0],
    ['0.99', 99],
    ['.99', 99],
    ['12.', 1200],
    ['  $ 7.05 ', 705],
  ])('parses %j as %i cents', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected)
  })

  it.each(['', '   ', '$', 'abc', '12abc', '1.2.3', '12.345', '-5', '-$5.00', '$-5', '.'])(
    'rejects %j',
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull()
    },
  )
})

describe('formatCents', () => {
  it('formats cents as USD', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(5)).toBe('$0.05')
  })

  it('formats negative amounts', () => {
    expect(formatCents(-1250)).toBe('-$12.50')
  })
})

describe('formatSignedCents', () => {
  it('shows a sign for gains and losses', () => {
    expect(formatSignedCents(457)).toBe('+$4.57')
    expect(formatSignedCents(-100)).toBe('−$1.00')
    expect(formatSignedCents(0)).toBe('$0.00')
  })
})
