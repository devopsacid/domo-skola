/** Ports of the e2e stack. The mock-mail default (8791) is often taken, so both are overridable. */
export const PORT = Number(process.env.E2E_PORT ?? 18788);
export const MAIL_PORT = Number(process.env.MOCK_MAIL_PORT ?? 18791);
/** Pages and Functions under test. `localhost`, not 127.0.0.1: ALLOWED_ORIGINS must equal the browser origin. */
export const BASE_URL = `http://localhost:${PORT}`;
export const MAIL_URL = `http://127.0.0.1:${MAIL_PORT}`;
