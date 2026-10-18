# @os/line

LINE Messaging APIのWebhookを受信し、テキストをそのまま返信するBotです。
`POST /webhook`で署名を検証し、返信が完了したらHTTP 200を返します。
画像などのテキスト以外のイベントや、返信トークンのないイベントは受信確認だけを行います。

## 起動

リポジトリのルートで実行します。

```sh
pnpm install
cp packages/line/.env.example packages/line/.env
```

`packages/line/.env`に、LINE Developersコンソールで取得した認証情報を設定します。

- `LINE_CHANNEL_SECRET`: チャネルシークレット。受信したWebhookの署名検証に使います。
- `LINE_CHANNEL_ACCESS_TOKEN`: チャネルアクセストークン。メッセージの返信に使います。
- `PORT`: 待ち受けポート。省略すると3000です。

```sh
pnpm --filter @os/line build
pnpm --filter @os/line start
```

この起動コマンドは`packages/line/.env`を読み込みます。既存の環境変数を使う場合、`.env`は不要です。

## LINEとの接続

1. 起動したサーバーを、外部からアクセスできるHTTPSのURLで公開します。
2. LINE Developersコンソールで、Messaging APIのWebhook URLに`https://公開ホスト/webhook`を設定します。
3. Webhook URLの「検証」を実行し、「Webhookの利用」を有効にします。

署名がない、または一致しないリクエストにはHTTP 401、不正なJSONにはHTTP 400を返します。
Botにテキストを送ると同じ内容を返信します。LINE公式アカウント側の自動返信を止める場合は、応答メッセージやあいさつメッセージも無効にしてください。

署名検証には[公式LINE Bot SDKのWebhookミドルウェア](https://line.github.io/line-bot-sdk-nodejs/guide/webhook.html)を使っています。

## テスト

```sh
pnpm --filter @os/line test
```
