import { createBotServer } from './bot.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORTには1〜65535の整数を設定してください。');
}

const server = createBotServer({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

server.listen(port, () => console.log(`LINE Bot: http://localhost:${port}`));
server.on('error', error => {
  console.error(`サーバーを起動できませんでした: ${error.code}`);
  process.exitCode = 1;
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close());
}
