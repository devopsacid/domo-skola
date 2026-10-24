#!/usr/bin/env node
// `node tools/mock-mail/index.mjs` (or `pnpm mock-mail`). Port: MOCK_MAIL_PORT (default 8791,
// matching EMAIL_API_BASE in .dev.vars.example). Open the printed URL for the message list.
import { startMockMail } from './server.mjs';

const port = Number(process.env.MOCK_MAIL_PORT ?? 8791);
const { url } = await startMockMail({ port });
console.log(`mock-mail listening on ${url} (list UI at /, API at /messages)`);
