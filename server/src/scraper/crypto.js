import crypto from 'crypto';

/**
 * Decrypts encrypted price payload returned by INE mock store API
 * Keystream is derived via SHA-256 of:
 * "ine-mock-store-shared-k3y|enc|" + sessionToken
 */
export function decryptPricePayload(ciphertextBase64, sessionToken) {
  if (!ciphertextBase64 || !sessionToken) {
    throw new Error('Missing ciphertext or session token for decryption');
  }

  const salt = 'ine-mock-store-shared-k3y';
  const hashInput = `${salt}|enc|${sessionToken}`;
  const key = crypto.createHash('sha256').update(hashInput).digest();

  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  const decrypted = Buffer.alloc(ciphertext.length);

  for (let i = 0; i < ciphertext.length; i++) {
    decrypted[i] = ciphertext[i] ^ key[i % key.length];
  }

  const decodedStr = decrypted.toString('utf8');
  try {
    const s = JSON.parse(decodedStr);
    return {
      price: s.p,
      mrp: s.m,
      sale: s.n,
      stock: s.s,
      inStock: s.s > 0,
      currency: s.c || 'INR',
      rating: s.r,
      ratingCount: s.rc,
      seller: s.sl,
      deliveryDays: s.dd,
      variant: s.v,
      badgePct: s.b,
      raw: s
    };
  } catch (err) {
    throw new Error(`Failed to parse decrypted JSON payload: ${err.message}`);
  }
}
