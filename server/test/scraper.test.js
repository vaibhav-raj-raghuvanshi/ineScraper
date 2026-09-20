import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePrice, parseStock, validateSnapshot } from '../src/scraper/parser.js';
import { decryptPricePayload } from '../src/scraper/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/valid_product.json'), 'utf8'));
const placeholderFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/placeholder_response.json'), 'utf8'));

test('Defensive Price Parsing', async (t) => {
  await t.test('parses Indian Rupee formatted prices', () => {
    assert.equal(parsePrice('₹1,299.00'), 1299);
    assert.equal(parsePrice('₹ 16,142'), 16142);
    assert.equal(parsePrice('₹33,629'), 33629);
  });

  await t.test('parses standard comma-separated and raw prices', () => {
    assert.equal(parsePrice('1,299.00'), 1299);
    assert.equal(parsePrice('$12.50'), 12.5);
    assert.equal(parsePrice(499), 499);
    assert.equal(parsePrice(' 24886 '), 24886);
  });

  await t.test('rejects placeholders, zero, negatives, and invalid inputs', () => {
    for (const ph of placeholderFixture.placeholders) {
      assert.equal(parsePrice(ph), null, `Expected "${ph}" to be rejected`);
    }
    assert.equal(parsePrice(0), null);
    assert.equal(parsePrice(-10), null);
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice(null), null);
    assert.equal(parsePrice(undefined), null);
  });
});

test('Defensive Stock Parsing', async (t) => {
  await t.test('parses multiple stock text variants correctly', () => {
    for (const item of placeholderFixture.stockVariants) {
      const result = parseStock(item.input);
      assert.equal(result.inStock, item.expectedStock, `Mismatch in stock for: ${item.input}`);
      assert.equal(result.count, item.expectedCount, `Mismatch in count for: ${item.input}`);
    }
  });

  await t.test('handles raw booleans and numbers', () => {
    assert.deepEqual(parseStock(true), { inStock: true, count: null });
    assert.deepEqual(parseStock(false), { inStock: false, count: 0 });
    assert.deepEqual(parseStock(15), { inStock: true, count: 15 });
    assert.deepEqual(parseStock(0), { inStock: false, count: 0 });
  });
});

test('Cryptographic Payload Decryption', () => {
  const decrypted = decryptPricePayload(
    validFixture.sampleCiphertext,
    validFixture.sessionToken
  );

  assert.equal(decrypted.price, validFixture.expected.price);
  assert.equal(decrypted.mrp, validFixture.expected.mrp);
  assert.equal(decrypted.stock, validFixture.expected.stock);
  assert.equal(decrypted.inStock, validFixture.expected.inStock);
  assert.equal(decrypted.currency, validFixture.expected.currency);
  assert.equal(decrypted.seller, validFixture.expected.seller);
});

test('Validation Engine & Zod Schema', async (t) => {
  await t.test('accepts valid snapshot', () => {
    const candidate = {
      price: '₹16,142',
      mrp: '₹33,629',
      stock: '72 IN STOCK',
      seller: 'Ashgrove Depot'
    };
    const result = validateSnapshot(candidate, 433);
    assert.equal(result.valid, true);
    assert.equal(result.data.price, 16142);
    assert.equal(result.data.inStock, true);
    assert.equal(result.data.stockCount, 72);
  });

  await t.test('rejects placeholder price as invalid attempt (never store wrong data)', () => {
    const candidate = {
      price: 'Price hidden',
      stock: 'In stock'
    };
    const result = validateSnapshot(candidate, 433);
    assert.equal(result.valid, false);
    assert.equal(result.data, null);
  });

  await t.test('flags possible structure change when required fields are missing', () => {
    const brokenCandidate = {
      somethingElse: 123
    };
    const result = validateSnapshot(brokenCandidate, 433);
    assert.equal(result.valid, false);
    assert.equal(result.structureChange, true);
  });
});
