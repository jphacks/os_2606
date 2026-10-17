# @os/sensor

## 赤外線送受信

`@os/sensor` はRaspberry PiのLinux赤外線ドライバーを `ir-ctl` 経由で利用します。
自作コードはTypeScriptで、送受信時に `ir-ctl` をサブプロセスとして起動します。

### Raspberry Piの準備

Node.js 22.6以降とpnpm 10以降を用意し、`ir-ctl` を含む `v4l-utils` をインストールします。
以下はリポジトリのルートで実行します。

```sh
sudo apt install v4l-utils
pnpm install
pnpm --filter @os/sensor build
cp .env.example .env
pnpm ir boot-config
```

`.env` の `IR_RX_GPIO`（初期値17）と `IR_TX_GPIO`（初期値18）はBCM番号です。
表示された `dtoverlay` の2行を `/boot/firmware/config.txt` に設定して再起動してください。
既存の `gpio-ir` / `gpio-ir-tx` 設定がある場合は置き換えます。
ピンを変更したときも、この設定更新と再起動が必要です。
アプリはGPIO番号から `/dev/lirc*` を選ぶため、デバイス番号の入れ替わりには依存しません。
実行ユーザーには送受信両方のデバイスの読み書き権限が必要です。

### 記録済み信号の直接送信

`+パルス長 -休止時間` が交互に並ぶ、マイクロ秒単位の信号ファイルをそのまま送信できます。
エアコン以外にも使え、学習や通信方式の判別は不要です。

```sh
pnpm ir send-raw ~/ir_signals/vol-up.ir
```

例えば `+9000 -4500 +560 -560 +560` のような形式です。
パルス長と途中の休止時間を変えずに送信し、ファイル末尾の休止時間だけはLIRCの仕様に合わせて除きます。
この形式には搬送波の情報がないため、38 kHz・デューティ比50%で送信します。

### 検証とライセンス

```sh
pnpm test:ir
```

実測テスト信号は [IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266) を基にしています。
`packages/sensor` はLGPL-2.1で、ライセンス本文は同ディレクトリの `LICENSE` にあります。
テストではGPIO設定、LIRCのI/O処理、信号ファイルの読み取りを検証します。
