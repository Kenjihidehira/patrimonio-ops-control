const encoder = new TextEncoder();
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const noncePattern = /^[A-Za-z0-9_-]{16,80}$/;

export async function signGatewayRequest(secret, timestamp, nonce, body) {
  if (!secret || !noncePattern.test(nonce)) {
    throw new Error("Invalid gateway signing input.");
  }
  const key = await hmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingPayload(timestamp, nonce, body)),
  );
  return base64Url(new Uint8Array(signature));
}

export async function verifyGatewayRequest({
  secret,
  timestamp,
  nonce,
  signature,
  body,
  now = Date.now(),
}) {
  if (
    !secret
    || !signature
    || !noncePattern.test(nonce)
    || !/^\d{13}$/.test(timestamp)
  ) {
    return false;
  }

  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || Math.abs(now - issuedAt) > MAX_CLOCK_SKEW_MS) {
    return false;
  }

  let signatureBytes;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return false;
  }

  const key = await hmacKey(secret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(signingPayload(timestamp, nonce, body)),
  );
}

function signingPayload(timestamp, nonce, body) {
  return `${timestamp}.${nonce}.${body}`;
}

function hmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("Invalid signature.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=";
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
