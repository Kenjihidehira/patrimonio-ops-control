const encoder = new TextEncoder();

export async function createGatewaySignature(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${nonce}.${body}`),
  );
  return base64Url(new Uint8Array(signature));
}

export function createGatewayNonce(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(24)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
