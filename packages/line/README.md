# @os/line

LINE Messaging APIのWebhookを受信し、テキストをそのまま返信するBotと、Coreから呼び出す乾燥完了通知APIを提供します。
`POST /webhook`で署名を検証し、返信が完了したらHTTP 200を返します。
画像などのテキスト以外のイベントや、返信トークンのないイベントは受信確認だけを行います。

## 起動

リポジトリのルートで実行します。

```sh
pnpm install
test -e .env || cp .env.example .env
```

ルートの`.env`に、LINE Developersコンソールで取得した認証情報を設定します。
GPIOなどのセンサー設定も同じファイルで管理します。LINEサーバーの起動に必要なのは次の認証情報2項目だけです。

- `LINE_CHANNEL_SECRET`: チャネルシークレット。受信したWebhookの署名検証に使います。
- `LINE_CHANNEL_ACCESS_TOKEN`: チャネルアクセストークン。メッセージの返信に使います。
- `PORT`: 待ち受けポート。省略すると3000です。

```sh
pnpm --filter @os/line build
pnpm start
```

`pnpm start`と`pnpm --filter @os/line start`は、どちらもルートの`.env`を読み込みます。
既存の環境変数が優先され、環境変数だけで設定する場合は`.env`は不要です。
以前の`packages/line/.env`を使用している場合は、認証情報とポートをルートの`.env`へ移してください。

`GET /healthz`は起動確認用で、準備できていればHTTP 200と`ok`を返します。
LINEへの外部通信や認証情報の出力は行いません。
SIGTERM・SIGINTを受け取ると新規接続を止め、処理中のHTTPリクエストが完了してから終了します。

Raspberry Piでのsystemdによる自動起動・デプロイ時の再起動は[デプロイ手順](../../docs/raspberry-pi-deployment.md)を参照してください。

## LINEとの接続

1. 起動したサーバーを、外部からアクセスできるHTTPSのURLで公開します。
2. LINE Developersコンソールで、Messaging APIのWebhook URLに`https://公開ホスト/webhook`を設定します。
3. Webhook URLの「検証」を実行し、「Webhookの利用」を有効にします。

署名がない、または一致しないリクエストにはHTTP 401、不正なJSONにはHTTP 400を返します。
Botにテキストを送ると同じ内容を返信します。LINE公式アカウント側の自動返信を止める場合は、応答メッセージやあいさつメッセージも無効にしてください。

署名検証には[公式LINE Bot SDKのWebhookミドルウェア](https://line.github.io/line-bot-sdk-nodejs/guide/webhook.html)を使っています。

## Coreから乾燥完了を通知する

`createLineApi(channelAccessToken, userId)`は、`@os/api`の`LineApi`を実装したオブジェクトを返します。
洗濯を依頼したユーザーのIDを、署名検証済みのWebhookイベントの`source.userId`から取得して作成します。
その`LineApi`を対象の乾燥処理に紐づけてCoreへ渡し、Coreは乾燥完了時に`sendNotificationFinishDrying()`を呼び出します。

Webhookを処理する側で、通知用APIを作成する例です。

```ts
import type { webhook } from "@line/bot-sdk";
import { createLineApi } from "@os/line";

function createDryingNotification(channelAccessToken: string, event: webhook.MessageEvent) {
  const userId = event.source?.userId;
  if (!userId) {
    throw new Error("Webhookイベントに通知先のユーザーIDがありません。");
  }

  return createLineApi(channelAccessToken, userId);
}
```

ユーザーIDはリクエストに紐づく情報として扱います。複数ユーザーからメッセージを受け取っても、すでに作成した`LineApi`の通知先は変わりません。
WebhookからCoreを呼び出す処理への組み込みは[#16](https://github.com/jphacks/os_2606/issues/16)で行います。

「洗濯物の乾燥が完了しました。」を[プッシュメッセージ](https://line.github.io/line-bot-sdk-nodejs/guide/client.html)として送信するため、Webhookの返信トークンは不要です。
送信APIの成功を待って`Promise<void>`が完了し、送信に失敗した場合はエラーを呼び出し元へ返します。
アクセストークンやユーザーIDが空文字・空白のみの場合は、APIの作成時にエラーになります。

通知先のユーザーはBotを友だち追加してください。

## テスト

```sh
pnpm --filter @os/line test
```
