// Minimal Web Push sender (RFC 8292 / VAPID + RFC 8291 aes128gcm).
// Deno runtime, no 3rd-party deps beyond the standard library.
//
// Usage:
//   const ok = await sendWebPush(subscription, JSON.stringify({ title, body, url }));
//
// Returns:
//   { ok: true, status: number }      — delivered, 2xx
//   { ok: false, status: number, body: string, gone: boolean }
//     gone=true → 404/410: unsubscribe at the DB level.

// deno-lint-ignore-file no-explicit-any

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendResult {
  ok: boolean;
  status: number;
  body?: string;
  gone?: boolean;
}

// Base64url helpers.
function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function importVapidPrivateKey(pemOrB64: string): Promise<CryptoKey> {
  // Accept a raw base64url-encoded 32-byte private key (the standard VAPID format).
  const raw = b64urlDecode(pemOrB64);
  if (raw.length !== 32) throw new Error('VAPID private key must be 32 bytes (base64url)');
  const pkcs8 = p256PrivateKeyToPkcs8(raw);
  return await crypto.subtle.importKey(
    'pkcs8', pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  );
}

// Build a minimal PKCS#8 DER wrapper around a 32-byte raw P-256 private key.
// Avoids pulling in a PEM library.
function p256PrivateKeyToPkcs8(raw: Uint8Array): Uint8Array {
  // Prefix + raw private key. PKCS#8 envelope for P-256 ECPrivateKey (no pub).
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48,
    0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  return concat(prefix, raw);
}

async function signVapidJwt(
  audience: string, subject: string, privateKey: CryptoKey, publicKeyB64url: string,
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = { aud: audience, exp, sub: subject };
  const enc = new TextEncoder();
  const signingInput = `${b64urlEncode(enc.encode(JSON.stringify(header)))}.${b64urlEncode(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    enc.encode(signingInput),
  );
  // WebCrypto emits raw r||s (64 bytes). That's what JWS wants.
  const jwt = `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
  // public key is sent separately in the header, not in the JWT.
  void publicKeyB64url;
  return jwt;
}

// aes128gcm (RFC 8188) content encryption for push.
async function encryptPayload(
  plaintext: Uint8Array,
  subscriberP256dh: Uint8Array,
  subscriberAuth: Uint8Array,
): Promise<{ ciphertext: Uint8Array; appPublicKeyRaw: Uint8Array }> {
  // Ephemeral EC key pair.
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits'],
  );
  const appPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  // Import subscriber key.
  const subscriberKey = await crypto.subtle.importKey(
    'raw', subscriberP256dh,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey },
    ephemeral.privateKey, 256,
  );
  const shared = new Uint8Array(sharedBits);

  // HKDF per RFC 8291.
  const ikm = await hkdf(subscriberAuth, shared,
    concat(new TextEncoder().encode('WebPush: info\0'), subscriberP256dh, appPublicKeyRaw),
    32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  // Pad marker (0x02) + 0 bytes padding.
  const record = concat(plaintext, new Uint8Array([0x02]));

  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, cekKey, record,
  ));

  // RFC 8188 framing header: salt(16) | rs(4, BE uint32) | idlen(1) | keyid | body
  const rs = 4096;
  const idlen = appPublicKeyRaw.length; // 65 bytes uncompressed P-256
  const header = new Uint8Array(16 + 4 + 1 + idlen);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = idlen;
  header.set(appPublicKeyRaw, 21);

  return { ciphertext: concat(header, ciphertext), appPublicKeyRaw };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key, length * 8,
  );
  return new Uint8Array(bits);
}

export async function sendWebPush(
  sub: PushSubscription, body: string, ttl = 60,
): Promise<SendResult> {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) {
    return { ok: false, status: 500, body: 'VAPID keys not configured' };
  }

  const privKey = await importVapidPrivateKey(privateKey);
  const endpointUrl = new URL(sub.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const jwt = await signVapidJwt(audience, subject, privKey, publicKey);

  const { ciphertext } = await encryptPayload(
    new TextEncoder().encode(body),
    b64urlDecode(sub.p256dh),
    b64urlDecode(sub.auth),
  );

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': String(ttl),
      'Authorization': `vapid t=${jwt}, k=${publicKey}`,
    },
    body: ciphertext,
  });

  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text().catch(() => '');
  const gone = res.status === 404 || res.status === 410;
  return { ok: false, status: res.status, body: text, gone };
}
