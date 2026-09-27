import xxhash from "xxhash-wasm";

type HasherType = (input: string) => string;

let hasherPromise: Promise<HasherType> | null = null;

function fallbackHash(str: string): string {
  let hash1 = 0xdeadbeef ^ 0;
  let hash2 = 0x41c64e6d ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ ch, 2654435761);
    hash2 = Math.imul(hash2 ^ ch, 1597334677);
  }
  hash1 = Math.imul(hash1 ^ (hash1 >>> 16), 2246822507);
  hash1 ^= Math.imul(hash2 ^ (hash2 >>> 13), 3266489909);
  hash2 = Math.imul(hash2 ^ (hash2 >>> 16), 2246822507);
  hash2 ^= Math.imul(hash1 ^ (hash1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & hash2) + (hash1 >>> 0)).toString(16).padStart(16, "0");
}

export async function getHasher(): Promise<HasherType> {
  if (!hasherPromise) {
    hasherPromise = xxhash()
      .then((hasher) => {
        return (input: string) => hasher.h64ToString(input);
      })
      .catch((err) => {
        console.warn("Failed to initialize xxhash-wasm, using JS fallback:", err);
        return fallbackHash;
      });
  }
  return hasherPromise;
}

export async function computeContentHash(content: string): Promise<string> {
  const hasher = await getHasher();
  return hasher(content);
}
