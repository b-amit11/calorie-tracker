import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

// OWASP-recommended scrypt parameters (N=2^17, r=8, p=1). Stored with the hash so they can be raised later.
const PARAMS = { N: process.env.NODE_ENV === "test" ? 2 ** 10 : 2 ** 17, r: 8, p: 1 }; // cheap in tests only
const KEY_LEN = 32;

export const MIN_PASSWORD_LENGTH = 8;

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LEN, { ...PARAMS, maxmem: 256 * 1024 * 1024 });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024,
  });
  return timingSafeEqual(key, expected);
}

/** A real hash of a random password, used to keep login timing the same when the email doesn't exist. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));
