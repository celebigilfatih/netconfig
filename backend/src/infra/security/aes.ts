import crypto from "node:crypto";

function getKeyFromEnv(): Buffer {
  const key = process.env.CRED_ENCRYPTION_KEY;
  if (!key) throw new Error("CRED_ENCRYPTION_KEY not set");
  if (/^[A-Fa-f0-9]+$/.test(key) && key.length === 64) {
    return Buffer.from(key, "hex");
  }
  const b64 = Buffer.from(key, "base64");
  if (b64.length === 32) return b64;
  throw new Error("CRED_ENCRYPTION_KEY must be 32 bytes (hex or base64)");
}

export function encryptSecret(plain: string): { ciphertext: Buffer; iv: Buffer } {
  const iv = crypto.randomBytes(12);
  const key = getKeyFromEnv();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), iv };
}

export function decryptSecret(ciphertextWithTag: Buffer, iv: Buffer): string {
  const key = getKeyFromEnv();
  const tag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);
  const enc = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

