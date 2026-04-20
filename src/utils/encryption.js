import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  throw new Error(
    'Missing required encryption config: VITE_ENCRYPTION_KEY must be set'
  );
}

export function encryptField(value) {
  if (value === null || value === undefined) return value;
  const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
  return CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY).toString();
}

export function decryptField(ciphertext) {
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      throw new Error('Decryption produced empty result');
    }
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}
