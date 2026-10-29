import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  if (password.length < 12 || password.length > 256)
    throw new Error('Use a password of 12–256 characters');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [, salt, expected] = hash.split('$');
  if (!salt || !expected || password.length > 256) return false;
  const key = (await derive(password, salt, 64)) as Buffer;
  const target = Buffer.from(expected, 'hex');
  return key.length === target.length && timingSafeEqual(key, target);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
