# @os/sensor

## 赤外線エアコン操作

`@os/sensor` はRaspberry PiのLinux赤外線ドライバーを `ir-ctl` 経由で利用します。
自作コードはTypeScriptで、送受信時に `ir-ctl` をサブプロセスとして起動します。
通信方式は学習した信号から判別します。メーカー名・型番を指定する設定はありません。
以下の方式に対応しています。同じメーカーでも、表にない方式は未対応です。

| メーカー | 対応方式 | 温度 | 固定風向の指定 |
| --- | --- | --- | --- |
| 三菱電機 | MITSUBISHI_AC（144 bit）、MITSUBISHI112 | 16〜31℃、144 bitは0.5℃刻み | 上下・左右 |

144ビット方式は0.5℃刻み、112ビット方式は1℃刻みです。
リモコンをON表示にし、温度か運転モードのボタンで学習してください。

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

### 学習と操作

```sh
pnpm ir learn
# 15秒以内に、ON表示の純正リモコンを受信機に向けて温度ボタンを1回押す

pnpm ir send '{"acMode":"cool","temperature":26}'
pnpm ir stop
```

学習時に信号の方式とチェックサムを確認し、`data/ir/remote.json` に保存します。
次回起動時はこのファイルを読み込みます。送信に成功した設定も同じファイルへ保存します。
再学習に成功すると保存内容を置き換えます。未対応・壊れた信号は保存しません。
判別できるのは通信方式で、本体の正確な型番や風向機構の有無までは判別できません。

```ts
import { learnRemote, loadRemoteControl } from "@os/sensor";
import type { AcMessage, RemoteControl } from "@os/api";

await learnRemote(); // 初回のみ。対応するリモコンの信号を受信して保存
const remote: RemoteControl = await loadRemoteControl();
const message: AcMessage = {
  acMode: "heat",
  temperature: 22,
  // 対応する方式でだけ指定する。省略時は保存済みの設定を維持。
  // windDirectionVertical: "up",       // up | middle | down
  // windDirectionHorizontal: "center", // left | center | right
};
await remote.send(message);
await remote.stop();
```

`send()` は電源ONを含む状態を送信し、`stop()` は電源OFFを送信します。
同じインスタンスへの操作は順番に送信されます。`send()` は送信と設定保存の完了を待ちますが、本体の受信確認はできません。
風向は任意です。省略した軸は学習時または直近の送信成功時の設定を維持します。
送信に失敗した設定は引き継ぎません。保存後は再起動しても設定を引き継ぎます。
純正リモコンなど別の操作による本体側の変更は追跡できません。
風量は三菱電機112ビット方式では学習した値、それ以外は自動です。
対応するタイマー設定は送信時に解除します。
未対応の風向や温度は送信前にエラーにし、近い値への変換や無視はしません。

### 記録済み信号の直接送信

`+パルス長 -休止時間` が交互に並ぶ、マイクロ秒単位の信号ファイルをそのまま送信できます。
エアコン以外にも使え、学習や通信方式の判別は不要です。

```sh
pnpm ir send-raw ~/ir_signals/vol-up.ir
```

例えば `+9000 -4500 +560 -560 +560` のような形式です。
パルス長と途中の休止時間を変えずに送信し、ファイル末尾の休止時間だけはLIRCの仕様に合わせて除きます。
この形式には搬送波の情報がないため、38 kHz・デューティ比50%で送信します。

### Flipper-IRDBの利用と検証

[Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB) の `.ir` ファイルから、対応方式の `raw` ボタンを学習データとして取り込めます。

```sh
pnpm ir import-flipper /path/to/remote.ir ButtonName
pnpm test:ir
```

プロトコル処理と実測テスト信号は [IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266) を基にしています。
`packages/sensor` はLGPL-2.1で、ライセンス本文は同ディレクトリの `LICENSE` にあります。
テストでは公開されている実測信号、学習・保存・送信の流れ、LIRCのI/O処理を検証します。
エアコン本体の動作確認は別途必要です。
