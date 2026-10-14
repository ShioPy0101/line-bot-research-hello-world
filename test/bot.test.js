import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createBotServer } from '../src/bot.js';

const secret = 'test-secret';
const message = text => ({ type: 'message', replyToken: 'reply-token', message: { type: 'text', text } });

async function setup(t, apiStatus = 200) {
  const calls = [];
  const server = createBotServer({
    channelSecret: secret,
    channelAccessToken: 'test-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      return { ok: apiStatus === 200, status: apiStatus };
    },
    logger: { error() {} },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    calls,
    base,
    post: (body, signature = createHmac('sha256', secret).update(body).digest('base64')) => fetch(`${base}/webhook`, {
      method: 'POST',
      headers: { 'x-line-signature': signature, 'content-type': 'application/json' },
      body,
    }),
  };
}

test('signed webhook replies to Japanese text and preserves the original echo', async t => {
  const { calls, post } = await setup(t);
  const response = await post(JSON.stringify({ events: [message('こんにちは'), message('テスト 😊')] }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.line.me/v2/bot/message/reply');
  assert.equal(calls[0].headers.authorization, 'Bearer test-token');
  assert.deepEqual(calls[0].body, {
    replyToken: 'reply-token', messages: [{ type: 'text', text: 'こんにちは！LINE Botです 😊' }],
  });
  assert.equal(calls[1].body.messages[0].text, 'テスト 😊');
});

test('invalid and missing signatures never call the LINE API', async t => {
  const { calls, post, base } = await setup(t);
  const body = JSON.stringify({ events: [message('hello')] });
  assert.equal((await post(body, 'forged')).status, 401);
  assert.equal((await fetch(`${base}/webhook`, { method: 'POST', body })).status, 401);
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  assert.equal((await post(`${body} `, signature)).status, 401);
  assert.equal(calls.length, 0);
});

test('verification, health and ignored events succeed without replies', async t => {
  const { calls, post, base } = await setup(t);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
  assert.equal((await post(JSON.stringify({ events: [] }))).status, 200);
  assert.equal((await post(JSON.stringify({ events: [
    { type: 'unfollow' }, { ...message('hello'), mode: 'standby' },
  ] }))).status, 200);
  assert.equal(calls.length, 0);
});

test('follow, help and non-text messages receive guidance', async t => {
  const { calls, post } = await setup(t);
  assert.equal((await post(JSON.stringify({ events: [
    { type: 'follow', replyToken: 'follow-token' },
    message('help'),
    { type: 'message', replyToken: 'sticker-token', message: { type: 'sticker' } },
  ] }))).status, 200);
  assert.match(calls[0].body.messages[0].text, /友だち追加/);
  assert.match(calls[1].body.messages[0].text, /そのまま返信/);
  assert.equal(calls[2].body.messages[0].text, 'テキストメッセージを送ってください。');
});

test('malformed signed payloads are rejected', async t => {
  const { calls, post } = await setup(t);
  for (const body of ['{', '{}', 'null', '{"events":[null]}']) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test('LINE API failures are surfaced as a failed webhook', async t => {
  const { post } = await setup(t, 401);
  assert.equal((await post(JSON.stringify({ events: [message('hello')] }))).status, 502);
});

test('missing credentials prevent startup', () => {
  assert.throws(() => createBotServer({}), /LINE_CHANNEL_SECRET/);
});
