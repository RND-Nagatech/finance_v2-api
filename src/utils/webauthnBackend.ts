// akunting-backend/src/utils/webauthnBackend.ts
/**
 * Convert antara ArrayBuffer/Uint8Array <-> base64url
 */

export function toBase64URL(input: ArrayBuffer | Uint8Array | SharedArrayBuffer): string {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);
  return Buffer.from(u8)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function fromBase64URL(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const buffer = Buffer.from(padded, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
