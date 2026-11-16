import { createApp } from './app.mjs';
const app = await createApp({ logger: true });
try { await app.listen({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3001) }); }
catch (error) { app.log.error(error); process.exit(1); }
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await app.close(); process.exit(0); });
