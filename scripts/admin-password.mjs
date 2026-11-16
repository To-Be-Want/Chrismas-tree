import { createInterface } from 'node:readline/promises';
import { passwordHash } from '../server/security.mjs';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('设置管理员密码（至少12个字符，输入在本机可见）：');
rl.close();
if (password.length < 12) { console.error('密码至少12个字符。'); process.exit(1); }
console.log('\n将下面这一行写入服务器的 .env，不要提交到Git：');
console.log(`ADMIN_PASSWORD_HASH=${passwordHash(password)}`);
