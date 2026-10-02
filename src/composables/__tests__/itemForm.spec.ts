import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const { emptyValues, validateItem } = await import('../useItemForm')

const oneOff = { isSetVolume: false, costEditable: true }

describe('validateItem', () => {
  it('requires a name, a category and what we paid', () => {
    expect(validateItem(emptyValues(), oneOff)).toEqual({
      name: 'Give it a name.',
      category: 'Pick a category.',
      cost: 'Enter what you paid each, like 4 or 4.50.',
    })
  })

  it('accepts a complete one-off', () => {
    const values = {
      ...emptyValues(),
      name: 'Akira Vol. 1',
      category: 'manga' as const,
      cost: '12',
      price: '$28.00',
    }
    expect(validateItem(values, oneOff)).toEqual({})
  })

  it("doesn't need a cost when the lot split sets it", () => {
    const values = { ...emptyValues(), name: 'Figure', category: 'figure' as const, lotId: 'lot-1' }
    expect(validateItem(values, oneOff)).toEqual({})
    expect(validateItem({ ...values, overrideLotCost: true }, oneOff).cost).toBeDefined()
  })

  it('checks money, volume and ISBN formats', () => {
    const values = {
      ...emptyValues(),
      name: 'x',
      category: 'manga' as const,
      cost: 'free',
      price: 'abc',
      volumeNumber: '3a',
      isbn: '123',
    }
    const errors = validateItem(values, oneOff)
    expect(Object.keys(errors).sort()).toEqual(['cost', 'isbn', 'price', 'volumeNumber'])
  })

  it('accepts a valid ISBN-10 and leaves the name to the set for volumes', () => {
    const values = { ...emptyValues(), category: 'manga' as const, isbn: '1-56931-901-4' }
    expect(validateItem(values, { isSetVolume: true, costEditable: false })).toEqual({})
    expect(
      validateItem({ ...values, nameIsCustom: true }, { isSetVolume: true, costEditable: false })
        .name,
    ).toBe('Give it a name.')
  })
})
