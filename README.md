# シンプルなLINE Bot

Node.jsの標準機能だけで動く応答Botです。

- 「こんにちは」→ 挨拶を返信
- 「ヘルプ」「help」→ 使い方を返信
- それ以外のテキスト → 同じテキストを返信
- 友だち追加 → 歓迎メッセージを返信
- 画像やスタンプ → テキストの送信を案内

## 起動する

Node.js 22.9以上が必要です。追加パッケージのインストールは不要です。

```sh
cp .env.example .env
```

`.env`にLINEのチャネル情報を入力します。秘密情報なのでGitにコミットしないでください。

```dotenv
LINE_CHANNEL_SECRET=チャネルシークレット
LINE_CHANNEL_ACCESS_TOKEN=チャネルアクセストークン
PORT=3000
```

```sh
npm start
```

`http://localhost:3000/health`で起動を確認できます。開発中に自動再起動するには`npm run dev`を使います。

## LINEと接続する

1. [LINE公式の作成手順](https://developers.line.biz/ja/docs/messaging-api/building-bot/)に従い、LINE公式アカウントを作成してMessaging APIを有効にします。
2. [LINE Developersコンソール](https://developers.line.biz/console/)の対象チャネルから、チャネルシークレットとチャネルアクセストークンを取得して`.env`に設定します。
3. このサーバーをHTTPSで公開します。ローカル開発ではHTTPSトンネルでポート3000を公開する方法も使えます。ホスティング先では同じ環境変数を設定し、`npm start`で起動します。
4. Messaging API設定のWebhook URLを`https://あなたの公開ホスト/webhook`にして「検証」を実行し、「Webhookの利用」を有効にします。
5. LINE Official Account Managerの応答設定で「応答メッセージ」を無効にし、必要に応じて「あいさつメッセージ」も無効にします。Botとの二重返信を防げます。
6. チャネルのQRコードから友だち追加し、「こんにちは」を送信します。

LINEのチャネル情報と公開HTTPS URLの設定が完了すると、LINE上で返信できます。ローカルの起動確認だけではLINEから接続できません。

## テスト・変更

```sh
npm test
```

テストではLINE APIをモックするため、実際のトークンや通信は不要です。返信内容は`src/bot.js`の`replyText`で変更できます。

Webhookは[LINE公式の署名検証仕様](https://developers.line.biz/ja/docs/messaging-api/verify-webhook-signature/)に従い、JSON解析前の本文でHMAC-SHA256署名を検証します。検証用の空イベントにも対応しています。会話内容やトークンはログに出力しません。

これは小規模なサンプルです。永続キューやイベントIDの重複排除は実装していないため、Webhook再送時の厳密な一度だけの処理は保証しません。
