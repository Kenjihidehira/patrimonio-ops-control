export async function gatewayKeyMatches(supplied, configured = "", rotatedHash = "") {
  if (!supplied) return false;
  if (configured && (await valuesMatch(supplied, configured))) return true;
  if (!/^[a-f0-9]{64}$/.test(rotatedHash)) return false;

  const suppliedHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)),
  );
  return bytesMatch(suppliedHash, hexToBytes(rotatedHash));
}

async function valuesMatch(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return bytesMatch(new Uint8Array(leftHash), new Uint8Array(rightHash));
}

function hexToBytes(value) {
  return Uint8Array.from(value.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
}

function bytesMatch(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
