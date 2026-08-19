/**
 * MINIMAL EXAMPLE — Telegram Stars backend
 * ------------------------------------------------------------
 * This is NOT a ready-to-run server. It shows the two endpoints
 * the mini app's front end (index.html) expects at CONFIG.API_BASE,
 * and the shape of data they exchange. You still need to:
 *
 *   1. npm install express node-fetch crypto
 *   2. Create a bot with @BotFather, get its token, set BOT_TOKEN below
 *      (use an environment variable in real deployments — never commit it)
 *   3. Add your own persistent storage (a real DB) instead of the
 *      in-memory `db` object here
 *   4. Set up a webhook endpoint so Telegram can push you the
 *      "successful_payment" update and you can credit balnces
 *      server-side (see bottom of file)
 * ------------------------------------------------------------
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || '8912404275:AAHP7XjANwVU_Lkt5neqOAFdiKyybfVzoF8';

// Replace with a real database (Postgres, SQLite, etc.)
const db = { users: {} }; // keyed by Telegram user id

/**
 * Verifies that initData actually came from Telegram and wasn't
 * tampered with. Never trust initData without this check.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;
  return JSON.parse(params.get('user'));
}

/**
 * POST /api/create-invoice-link
 * body: { amount: number, initData: string }
 * -> { ok: true, link: string }
 */
app.post('/api/create-invoice-link', async (req, res) => {
  const { amount, initData } = req.body;
  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid Telegram data' });
  if (!amount || amount < 1) return res.status(400).json({ ok: false, error: 'Bad amount' });

  const payload = JSON.stringify({ userId: user.id, amount, ts: Date.now() });

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Пополнение доната',
      description: `Пополнение баланса на ${amount} ★`,
      payload,
      currency: 'XTR',           // Telegram Stars
      prices: [{ label: 'Донат', amount }], // for XTR, amount = number of Stars
    }),
  });
  const data = await tgRes.json();
  if (!data.ok) return res.status(500).json({ ok: false, error: data.description });

  res.json({ ok: true, link: data.result });
});

/**
 * POST /api/me
 * body: { initData: string }
 * -> { ok: true, balance: number, totalTopUp: number }
 */
app.post('/api/me', (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid Telegram data' });

  const record = db.users[user.id] || { balance: 0, totalTopUp: 0 };
  res.json({ ok: true, balance: record.balance, totalTopUp: record.totalTopUp });
});

/**
 * Telegram sends payment confirmations to YOUR BOT via updates,
 * not to this HTTP API. Set a webhook (setWebhook) pointing at an
 * endpoint like this one, and credit the balance only here —
 * this is the one place that can be trusted.
 */
app.post('/telegram-webhook', (req, res) => {
  const update = req.body;
  const sp = update.message && update.message.successful_payment;
  if (sp) {
    const { userId, amount } = JSON.parse(sp.invoice_payload);
    const record = db.users[userId] || { balance: 0, totalTopUp: 0 };
    record.balance += amount;
    record.totalTopUp += amount;
    db.users[userId] = record;
  }
  res.sendStatus(200);
});

app.listen(3000, () => console.log('Listening on :3000'));
