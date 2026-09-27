// Unit tests for lib/money.ts. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCents, parseAmount } from '../lib/money.ts'

test('parseAmount reads what a tradie types', () => {
  assert.equal(parseAmount('850'), 85000)
  assert.equal(parseAmount('850.5'), 85050)
  assert.equal(parseAmount('850.50'), 85050)
  assert.equal(parseAmount('1,200'), 120000)
  assert.equal(parseAmount(' $1,200.05 '), 120005)
  assert.equal(parseAmount('0.01'), 1)
  assert.equal(parseAmount('999999.99'), 99999999)
})

test('parseAmount rejects anything that is not a positive price', () => {
  for (const bad of ['', '0', '0.00', '-5', '−5', 'abc', '12a', '1.234', '.5', '1e3', '1000000',
    '12,5', '1,20', '1 200']) {
    assert.equal(parseAmount(bad), null, JSON.stringify(bad))
  }
})

test('formatCents always shows cents and uses a real minus sign', () => {
  assert.equal(formatCents(428000), '$4,280.00')
  assert.equal(formatCents(85050), '$850.50')
  assert.equal(formatCents(0), '$0.00')
  assert.equal(formatCents(-124000), '−$1,240.00')
  assert.equal(formatCents(-21275), '−$212.75')
})
