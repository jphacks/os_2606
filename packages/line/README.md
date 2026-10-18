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

`createLineApi(channelAccessToken)`は、`@os/api`の`LineApi`を実装したオブジェクトを返します。
Coreは乾燥完了時に`sendNotificationFinishDrying()`を呼び出し、Botを友だち追加している全員に一斉配信します。
ユーザーIDの事前登録・許可リスト・通知先一覧は不要です。

```ts
import { createLineApi } from "@os/line";

const line = createLineApi(channelAccessToken);
await line.sendNotificationFinishDrying();
```

「洗濯物の乾燥が完了しました。」を[一斉配信API](https://developers.line.biz/en/reference/messaging-api/#send-broadcast-message)で送信するため、Webhookの返信トークンは不要です。
送信APIの成功を待って`Promise<void>`が完了し、送信に失敗した場合はエラーを呼び出し元へ返します。
アクセストークンが空文字・空白のみの場合は、APIの作成時にエラーになります。

通知先のユーザーはBotを友だち追加してください。

## テスト

```sh
pnpm --filter @os/line test
```

## 実機の乾燥サイクルとの接続

`pnpm start` は起動時に `loadRemoteControl()` と `loadTemperatureSensor()` を読み込み、
実機の送信APIと室内DHT11を一つの乾燥サイクルへ接続します。仮実装へのフォールバックはありません。
リポジトリルートの `.env` に以下を設定してください。

| 設定 | 内容 |
| --- | --- |
| `OUTDOOR_TEMPERATURE` | 外気温（℃、必須）。 |
| `OUTDOOR_HUMIDITY` | 外気の相対湿度（%、必須）。 |
| `COMFORT_TEMPERATURE` | 在宅時の快適温度（16〜28℃、既定値24℃）。 |
| `IR_REMOTE_PATH` | 学習データのパス（既定値 `data/ir/remote.json`）。相対パスは実行ディレクトリ基準。 |

外気温湿度は起動時の値を使い、自動更新はしません。
GPIOの設定と配線は [sensorのREADME](../sensor/README.md) を参照してください。
最初にリポジトリルートで `pnpm ir learn` を実行し、リモコンを学習します。
学習データやセンサーを読み込めない場合、Botは起動エラーになります。

ユーザーを事前登録せずに操作できます。
全ユーザーが一つの家・エアコン・乾燥状態を共有します。誰かの外出・帰宅操作で、家全体の運転が切り替わります。
「洗濯したよ」と送るか、メニューから洗濯物の写真を送ると在宅モードで開始します。
写真は開始の合図として使い、画像解析は行いません。
外出・帰宅のポストバックで運転を切り替え、未開始の外出では外出モードから開始します。
`remoteControl.supports()` で送信できる設定だけを乾燥計画の候補にします。
Sharpなど除湿時に手動風量を指定できない機種では、`fanSpeed`を省略した自動除湿も候補にします。
自動風量は実測できないため、未校正の予測モデルでは中風量相当の係数を使います。
手動風量を指定できる機種では、省略が「前回値の維持」を意味する場合があるため、明示した風量から選びます。
起動前に室内センサーの初回測定にも成功する必要があり、読み取りエラーがあればWebhookを公開しません。
予測終了時刻以降の毎分チェックでエアコンを停止し、停止成功後に、Botを友だち追加している全員へ完了通知を一斉配信します。
停止・通知の失敗はログへ記録し、次のチェックで再試行します。

乾燥状態はメモリ内にあり、再起動時に復元されません。
終了時はcronを破棄しますが、エアコンへ停止信号は送りません。
