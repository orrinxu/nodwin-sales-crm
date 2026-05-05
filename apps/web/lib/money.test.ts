import { describe, it, expect } from 'vitest'
import {
  fromCents,
  fromAmount,
  fromString,
  zero,
  toCents,
  toDecimalString,
  toDisplay,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  absMoney,
  negateMoney,
  eq,
  gt,
  gte,
  lt,
  lte,
  isZeroMoney,
  isNegativeMoney,
  min,
  max,
} from './money'

describe('fromCents', () => {
  it('creates a Money instance from integer cents', () => {
    const m = fromCents(10050, 'USD')
    expect(toCents(m)).toBe(10050)
  })

  it('rejects non-integer cents', () => {
    expect(() => fromCents(100.5, 'USD')).toThrow('integer')
  })
})

describe('fromAmount', () => {
  it('creates a Money instance from decimal string', () => {
    const m = fromAmount('100.50', 'USD')
    expect(toCents(m)).toBe(10050)
  })

  it('handles whole numbers', () => {
    const m = fromAmount('50', 'USD')
    expect(toCents(m)).toBe(5000)
  })

  it('handles zero', () => {
    const m = fromAmount('0', 'USD')
    expect(toCents(m)).toBe(0)
  })

  it('handles negative amounts', () => {
    const m = fromAmount('-25.99', 'USD')
    expect(toCents(m)).toBe(-2599)
  })

  it('rounds fractional cents to nearest cent (10.005 → 1001¢)', () => {
    const m = fromAmount('10.005', 'USD')
    expect(toCents(m)).toBe(1001)
  })

  it('rounds 1.005 → 101¢ (classic float bug)', () => {
    const m = fromAmount('1.005', 'USD')
    expect(toCents(m)).toBe(101)
  })
})

describe('fromString', () => {
  it('parses a simple decimal string', () => {
    const m = fromString('99.99', 'USD')
    expect(toCents(m)).toBe(9999)
  })

  it('parses string with currency symbol', () => {
    const m = fromString('$199.99', 'USD')
    expect(toCents(m)).toBe(19999)
  })

  it('parses string with commas', () => {
    const m = fromString('1,234.56', 'USD')
    expect(toCents(m)).toBe(123456)
  })

  it('parses negative string', () => {
    const m = fromString('-50.00', 'USD')
    expect(toCents(m)).toBe(-5000)
  })

  it('throws on unparseable string', () => {
    expect(() => fromString('abc', 'USD')).toThrow('Cannot parse')
  })
})

describe('zero', () => {
  it('creates a zero-value Money', () => {
    const m = zero('USD')
    expect(toCents(m)).toBe(0)
    expect(isZeroMoney(m)).toBe(true)
  })
})

describe('toDecimalString', () => {
  it('converts cents back to decimal string', () => {
    expect(toDecimalString(fromCents(12345, 'USD'))).toBe('123.45')
  })

  it('handles negative amounts', () => {
    expect(toDecimalString(fromCents(-500, 'USD'))).toBe('-5.00')
  })
})

describe('toDisplay', () => {
  it('formats as US currency by default', () => {
    const m = fromCents(1999, 'USD')
    expect(toDisplay(m)).toBe('$19.99')
  })

  it('formats INR with locale', () => {
    const m = fromAmount('100000', 'INR')
    expect(toDisplay(m, 'en-IN')).toContain('₹1,00,000.00')
  })

  it('formats JPY (zero decimal currency)', () => {
    const m = fromAmount('500', 'JPY')
    expect(toDisplay(m, 'en-US')).toContain('¥500')
  })
})

describe('addMoney', () => {
  it('adds two same-currency amounts', () => {
    const a = fromCents(1000, 'USD')
    const b = fromCents(2500, 'USD')
    expect(toCents(addMoney(a, b))).toBe(3500)
  })

  it('throws on currency mismatch', () => {
    const a = fromCents(1000, 'USD')
    const b = fromCents(2000, 'EUR')
    expect(() => addMoney(a, b)).toThrow()
  })

  it('is commutative', () => {
    const a = fromCents(300, 'USD')
    const b = fromCents(700, 'USD')
    expect(toCents(addMoney(a, b))).toBe(toCents(addMoney(b, a)))
  })
})

describe('subtractMoney', () => {
  it('subtracts same-currency amounts', () => {
    const a = fromCents(5000, 'USD')
    const b = fromCents(1500, 'USD')
    expect(toCents(subtractMoney(a, b))).toBe(3500)
  })

  it('throws on currency mismatch', () => {
    expect(() =>
      subtractMoney(fromCents(100, 'USD'), fromCents(100, 'GBP')),
    ).toThrow()
  })

  it('can result in negative', () => {
    const a = fromCents(100, 'USD')
    const b = fromCents(500, 'USD')
    expect(toCents(subtractMoney(a, b))).toBe(-400)
  })
})

describe('multiplyMoney', () => {
  it('multiplies by an integer factor', () => {
    const m = fromCents(1000, 'USD')
    expect(toCents(multiplyMoney(m, '3'))).toBe(3000)
  })

  it('multiplies by a decimal factor with round mode', () => {
    const m = fromCents(100, 'USD')
    expect(toCents(multiplyMoney(m, '1.5', 'round'))).toBe(150)
  })

  it('rounds fractional cents with floor', () => {
    const m = fromCents(100, 'USD')
    expect(toCents(multiplyMoney(m, '1.333', 'floor'))).toBe(133)
  })

  it('rounds fractional cents with ceil', () => {
    const m = fromCents(100, 'USD')
    expect(toCents(multiplyMoney(m, '1.333', 'ceil'))).toBe(134)
  })
})

describe('divideMoney', () => {
  it('divides by an integer divisor', () => {
    const m = fromCents(1000, 'USD')
    expect(toCents(divideMoney(m, '4'))).toBe(250)
  })

  it('rounds to nearest cent by default', () => {
    const m = fromCents(100, 'USD')
    expect(toCents(divideMoney(m, '3'))).toBe(33)
  })

  it('floors on divide', () => {
    const m = fromCents(100, 'USD')
    expect(toCents(divideMoney(m, '3', 'floor'))).toBe(33)
  })

  it('ceils on divide', () => {
    const m = fromCents(100, 'USD')
    expect(toCents(divideMoney(m, '3', 'ceil'))).toBe(34)
  })

  it('throws on division by zero', () => {
    expect(() => divideMoney(fromCents(100, 'USD'), '0')).toThrow('zero')
  })
})

describe('absMoney and negateMoney', () => {
  it('abs returns positive representation', () => {
    expect(toCents(absMoney(fromCents(-500, 'USD')))).toBe(500)
  })

  it('abs on positive returns same', () => {
    expect(toCents(absMoney(fromCents(500, 'USD')))).toBe(500)
  })

  it('negate flips sign', () => {
    expect(toCents(negateMoney(fromCents(500, 'USD')))).toBe(-500)
  })
})

describe('comparison operators', () => {
  const a = fromCents(1000, 'USD')
  const b = fromCents(2000, 'USD')

  it('eq', () => {
    expect(eq(a, fromCents(1000, 'USD'))).toBe(true)
    expect(eq(a, b)).toBe(false)
  })

  it('gt / gte', () => {
    expect(gt(b, a)).toBe(true)
    expect(gt(a, b)).toBe(false)
    expect(gte(a, a)).toBe(true)
    expect(gte(b, a)).toBe(true)
  })

  it('lt / lte', () => {
    expect(lt(a, b)).toBe(true)
    expect(lt(b, a)).toBe(false)
    expect(lte(a, a)).toBe(true)
    expect(lte(a, b)).toBe(true)
  })

  it('throws on cross-currency comparison', () => {
    const usd = fromCents(100, 'USD')
    const eur = fromCents(100, 'EUR')
    expect(() => eq(usd, eur)).toThrow()
    expect(() => gt(usd, eur)).toThrow()
    expect(() => lt(usd, eur)).toThrow()
  })
})

describe('isZeroMoney / isNegativeMoney', () => {
  it('isZeroMoney', () => {
    expect(isZeroMoney(fromCents(0, 'USD'))).toBe(true)
    expect(isZeroMoney(fromCents(1, 'USD'))).toBe(false)
  })

  it('isNegativeMoney', () => {
    expect(isNegativeMoney(fromCents(-1, 'USD'))).toBe(true)
    expect(isNegativeMoney(fromCents(0, 'USD'))).toBe(false)
    expect(isNegativeMoney(fromCents(1, 'USD'))).toBe(false)
  })
})

describe('min / max', () => {
  const a = fromCents(500, 'USD')
  const b = fromCents(1500, 'USD')

  it('min returns the smaller amount', () => {
    expect(toCents(min(a, b))).toBe(500)
    expect(toCents(min(b, a))).toBe(500)
  })

  it('max returns the larger amount', () => {
    expect(toCents(max(a, b))).toBe(1500)
    expect(toCents(max(b, a))).toBe(1500)
  })
})

describe('rounding edge cases', () => {
  it('handles amounts smaller than a cent', () => {
    const m = fromAmount('0.001', 'USD')
    expect(toCents(m)).toBe(0)
  })

  it('handles amounts that round up from sub-cent', () => {
    const m = fromAmount('0.009', 'USD')
    expect(toCents(m)).toBe(1)
  })

  it('handles very large amounts without precision loss', () => {
    const m = fromCents(1_000_000_000_000, 'USD')
    expect(toDecimalString(m)).toBe('10000000000.00')
  })

  it('multiply by zero', () => {
    expect(isZeroMoney(multiplyMoney(fromCents(500, 'USD'), '0'))).toBe(true)
  })

  it('divide by one does nothing', () => {
    const m = fromCents(999, 'USD')
    expect(toCents(divideMoney(m, '1'))).toBe(999)
  })

  it('multiply by fraction results in fractional cent floor', () => {
    const m = fromCents(1, 'USD')
    expect(toCents(multiplyMoney(m, '0.333', 'floor'))).toBe(0)
  })

  it('multiply by fraction results in fractional cent ceil', () => {
    const m = fromCents(1, 'USD')
    expect(toCents(multiplyMoney(m, '0.333', 'ceil'))).toBe(1)
  })
})

describe('serialization round-trip', () => {
  it('JSON round-trips through toCents/toDecimalString', () => {
    const original = fromCents(4242, 'USD')
    const decimal = toDecimalString(original)
    const restored = fromAmount(decimal, 'USD')
    expect(toCents(restored)).toBe(4242)
    expect(eq(original, restored)).toBe(true)
  })
})
