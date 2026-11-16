import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [algorithm, salt, expected] = (encoded || '').split(':');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
}
export function validateBlessing(body) {
  if (!body || typeof body !== 'object' || typeof body.message !== 'string') return { error: '请写下你的祝福' };
  if (body.nickname !== undefined && typeof body.nickname !== 'string') return { error: '昵称格式不正确' };
  const nickname = (body.nickname || '').trim();
  const message = body.message.trim();
  if ([...nickname].length > 20) return { error: '昵称最多20字' };
  if (!message || [...message].length > 200) return { error: '祝福请填写1到200字' };
  if (/https?:\/\/|www\./i.test(message + nickname)) return { error: '暂不支持链接，请留下文字祝福' };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message + nickname)) return { error: '文字中含有不支持的字符' };
  const ornament_style = body.ornament_style ?? 'jewel';
  if (!['jewel','star','snowflake','heart'].includes(ornament_style)) return { error: '请选择有效的装饰样式' };
  return { nickname: nickname || null, message, ornament_style };
}
