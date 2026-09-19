export async function hashSecret(secret: string): Promise<string> {
  return Bun.password.hash(secret, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2
  });
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return Bun.password.verify(secret, hash);
}

export function createOpaqueToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
