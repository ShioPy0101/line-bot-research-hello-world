import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

function validSignature(body, signature, secret) {
  if (typeof signature !== 'string') return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('base64'));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function replyText(event) {
  if (event.type === 'follow') {
    return '友だち追加ありがとうございます！「こんにちは」や好きなメッセージを送ってください。';
  }
  if (event.type !== 'message') return null;
  if (event.message?.type !== 'text') return 'テキストメッセージを送ってください。';
  const text = event.message.text;
  if (typeof text !== 'string' || !text) return null;
  if (text.trim() === 'こんにちは') return 'こんにちは！LINE Botです 😊';
  if (['ヘルプ', 'help'].includes(text.trim().toLowerCase())) {
    return '「こんにちは」でご挨拶、それ以外のテキストはそのまま返信します。';
  }
  return text;
}

export function createBotServer({ channelSecret, channelAccessToken, fetchImpl = fetch, logger = console }) {
  if (!channelSecret || !channelAccessToken) {
    throw new Error('LINE_CHANNEL_SECRET と LINE_CHANNEL_ACCESS_TOKEN を設定してください。');
  }

  return createServer(async (req, res) => {
    const send = (status, message) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message }));
    };
    if (req.method === 'GET' && ['/', '/health'].includes(req.url)) {
      return send(200, 'LINE Bot is running');
    }
    if (req.method !== 'POST' || req.url !== '/webhook') return send(404, 'Not found');

    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return send(413, 'Payload too large');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!validSignature(body, req.headers['x-line-signature'], channelSecret)) {
        return send(401, 'Invalid signature');
      }
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return send(400, 'Invalid JSON');
      }
      if (!Array.isArray(payload?.events) || payload.events.some(event => !event || typeof event !== 'object')) {
        return send(400, 'Invalid events');
      }

      // 全イベントの処理完了を待ち、API失敗時は成功として応答しない。
      const results = await Promise.allSettled(payload.events.map(async event => {
        const text = replyText(event);
        if (!text || !event.replyToken || event.mode === 'standby') return;
        const response = await fetchImpl('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${channelAccessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text }] }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`LINE reply failed (HTTP ${response.status})`);
      }));
      if (results.some(result => result.status === 'rejected')) {
        logger.error('LINEへの返信に失敗しました。接続状態とチャネル設定を確認してください。');
        return send(502, 'Reply failed');
      }
      return send(200, 'OK');
    } catch {
      logger.error('Webhookの処理に失敗しました。');
      if (!res.headersSent) send(500, 'Internal server error');
    }
  });
}
