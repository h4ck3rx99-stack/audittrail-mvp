import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { COMMON_PASSWORDS } from "./common-passwords";

/**
 * Password hashing with scrypt (memory-hard). Format: scrypt$N$r$p$saltB64$hashB64.
 * Parameters are stored with each hash so they can be raised later without breaking logins.
 */

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEM = 128 * N * R * 2;

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummyHash: Promise<string> | null = null;

/**
 * Burns the same amount of work as a real verification. Used when the account does not exist,
 * so "no such user" and "wrong password" take a similar amount of time.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("audittrail-timing-equalizer-not-a-real-password");
  await verifyPassword(password, await dummyHash);
  return false;
}

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Returns a user-facing problem with the password, or null when acceptable. */
export function passwordPolicyProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower))
    return "This password is too common. Choose something less predictable.";
  if (/^(.)\1+$/.test(password)) return "This password is too predictable.";
  if (email && lower === email.toLowerCase()) return "Your password cannot be your email address.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.replace(/[^a-z]/g, "") === local.replace(/[^a-z]/g, "")) {
    return "Your password cannot be based on your email address.";
  }
  return null;
}
