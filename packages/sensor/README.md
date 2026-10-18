# @os/sensor

## 温湿度の取得（DHT11）

Raspberry Piの標準DHT11ドライバーを利用します。アプリ側はTypeScriptのみで、追加ライブラリは不要です。
温度は°C、湿度は相対湿度（%）で返します。

### 配線と設定

| DHT11 | Raspberry Pi |
| --- | --- |
| VCC | 3.3V（物理ピン1） |
| S / DATA | GPIO4（物理ピン7） |
| GND | GND（物理ピン6） |

リポジトリのルートにある`.env`に`DHT_GPIO=4`を設定します。
LINEの認証情報も同じ`.env`で管理します。Piへのデプロイ後は`/opt/os_2606/shared/.env`を編集してください。
赤外線受信の既定値GPIO17との重複を避けるため、温湿度センサーにはGPIO4を使います。
GPIO番号を変える場合は、配線・`.env`・以下のドライバー設定を同じ番号に揃えてください。

`/boot/firmware/config.txt`に以下を追加し、Raspberry Piを再起動します。

```ini
dtoverlay=dht11,gpiopin=4
```

プルアップ抵抗を内蔵した3ピンのDHT11モジュールを想定しています。
抵抗のないセンサーでは、DATAと3.3Vの間にプルアップ抵抗が必要です。
同じGPIOを使うPythonプログラムや赤外線ドライバーとは併用できません。

### CLI

リポジトリのルートで実行すると、温湿度を1回測定してJSONで出力します。

```sh
pnpm install
pnpm --filter @os/sensor build
pnpm sensor measure
```

出力例（温度は°C、湿度は相対湿度%）:

```json
{"temperature":26.5,"humidity":39.8}
```

一時的な読み取りエラーは自動でリトライします。リトライしても失敗した場合や、それ以外のエラーが発生した場合は、標準エラー出力に原因を表示して終了コード1を返します。

### API

```ts
import type { TemperatureSensor } from "@os/api";
import { loadTemperatureSensor } from "@os/sensor";

const sensor: TemperatureSensor = await loadTemperatureSensor();
const { temperature, humidity } = await sensor.measure();
console.log(`温度: ${temperature} °C、湿度: ${humidity} %`);
```

`.env`は実行時のカレントディレクトリから読み込みます。
GPIO番号でDHT11を探すため、`iio:device0`などのデバイス番号を設定する必要はありません。
実行ユーザーには`/sys/bus/iio/devices`内の該当デバイスの読み取り権限が必要です。

ドライバーは成功した測定値を2秒間保持します。定期測定は2秒以上の間隔を空けてください。
`measure()`は一時的な読み取りエラー（`EIO`・`EAGAIN`・`ETIMEDOUT`）が発生すると、2秒待って温湿度を取り直します。
初回を含めて最大3回試し、すべて失敗した場合は最後のエラーでrejectします。権限・設定のエラーや不正な測定値はリトライしません。
rejectした場合は呼び出し側でエラーを処理し、次の測定まで2秒以上空けてください。

ドライバー設定は[Raspberry PiのDHT11 overlay](https://github.com/raspberrypi/linux/blob/rpi-6.18.y/arch/arm/boot/dts/overlays/dht11-overlay.dts)、測定値の単位と保持期間は[LinuxのDHT11ドライバー](https://github.com/raspberrypi/linux/blob/rpi-6.18.y/drivers/iio/humidity/dht11.c)に基づいています。

## 赤外線エアコン操作

`@os/sensor` はRaspberry PiのLinux赤外線ドライバーを `ir-ctl` 経由で利用します。
自作コードはTypeScriptで、送受信時に `ir-ctl` をサブプロセスとして起動します。
通信方式は学習した信号から判別します。メーカー名・型番を指定する設定はありません。
以下の方式に対応しています。同じメーカーでも、表にない方式は未対応です。

| メーカー | 対応方式 | 温度 | 固定風向の指定 |
| --- | --- | --- | --- |
| 三菱電機 | MITSUBISHI_AC（144 bit）、MITSUBISHI112 | 16〜31℃、144 bitは0.5℃刻み | 上下・左右 |
| ダイキン | DAIKIN（280 bit）、DAIKIN2（312 bit） | 10〜32℃、DAIKIN2の冷房は18℃以上 | DAIKIN2のみ上下・左右 |
| パナソニック | PANASONIC_AC（216 bit、DKE/JKE/LKE/NKE/RKR） | 16〜30℃ | 上下。左右はDKE/RKR、LKE/NKEは中央のみ |
| 三菱重工 | MITSUBISHI_HEAVY_152 | 17〜31℃ | 上下・左右 |
| 日立 | HITACHI_AC（224 bit）、HITACHI_AC424 | 16〜32℃ | 未対応・省略して操作 |
| 東芝 | TOSHIBA_AC（72/80 bit） | 17〜30℃ | 未対応・省略して操作 |
| 富士通ゼネラル | FUJITSU_AC（120/128 bit） | 16〜30℃、ARREW4Eは0.5℃刻み | 未対応・省略して操作 |
| シャープ | SHARP_AC（104 bit） | 15〜30℃ | 未対応・省略して操作 |

温度は特記のない方式では1℃刻みです。シャープA705/A903は冷房・除湿に対応し、暖房の指定はエラーになります。
パナソニックCKPやAC32など電源がトグルの方式は、絶対的なON/OFFを指定できないため未対応です。
富士通などの短い停止・風向信号では学習できません。リモコンをON表示にし、温度か運転モードのボタンで学習してください。

### Raspberry Piの準備

Node.js 22.6以降とpnpm 10以降を用意し、`ir-ctl` を含む `v4l-utils` をインストールします。
以下はリポジトリのルートで実行します。

```sh
sudo apt install v4l-utils
pnpm install
pnpm --filter @os/sensor build
test -e .env || cp .env.example .env
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
pnpm ir send '{"acMode":"dehumidify","temperature":24}'
pnpm ir send '{"acMode":"cool","temperature":26,"fanSpeed":"high"}'
pnpm ir stop
```

学習時に信号の方式とチェックサムを確認し、`data/ir/remote.json` に保存します。
`IR_REMOTE_PATH` で保存先を変更できます（未指定なら `data/ir/remote.json`）。相対パスは実行ディレクトリ基準です。
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
  fanSpeed: "medium", // low | medium | high。省略時は保存済みの設定を維持。
  // 対応する方式でだけ指定する。省略時は保存済みの設定を維持。
  // windDirectionVertical: "up",       // up | middle | down
  // windDirectionHorizontal: "center", // left | center | right
};
await remote.send(message);
await remote.stop();
```

`send()` は電源ONを含む状態を送信し、`stop()` は電源OFFを送信します。
運転モードは冷房（`cool`）、暖房（`heat`）、除湿（`dehumidify`）に対応します。
同じインスタンスへの操作は順番に送信されます。`send()` は送信と設定保存の完了を待ちますが、本体の受信確認はできません。
風向は任意です。省略した軸は学習時または直近の送信成功時の設定を維持します。
送信に失敗した設定は引き継ぎません。保存後は再起動しても設定を引き継ぎます。
純正リモコンなど別の操作による本体側の変更は追跡できません。
風量は`fanSpeed`に`low`・`medium`・`high`を指定します。省略時は学習時または直近の送信成功時の設定を維持し、自動・静音などの学習値も保持します。
除湿には以下の方式固有の制約があります。明示した未対応の風量は送信前にエラーになります。

| 方式 | 除湿時の制約 |
| --- | --- |
| HITACHI_AC（224 bit） | `low`・`medium`のみ。風量省略時は保存値をこの範囲に収めます（自動は`low`、強風は`medium`）。 |
| HITACHI_AC424 | `low`のみ指定可能。省略時は自動・最弱・弱を保持し、それ以外は弱へ変更します。 |
| SHARP_AC | `fanSpeed`は省略してください。風量は自動になります。温度設定がないため、`temperature`は15〜30℃の整数かを検証した後、信号では固定値を使用します。 |

これらの制約で変更された風量も、送信成功後は次の操作へ引き継ぎます。
シャープA705/A903では、運転モード・温度から判別できる信号を学習してください。除湿信号だけでは両機種を区別できません。
学習済みの機種情報は保存するため、A705で除湿した後も冷房の温度表現を維持します。
対応するタイマー設定は送信時に解除します。シャープの風向は変更なしの命令を送ります。
未対応の風向、範囲外・刻み外の温度、不正な運転モード・風量は送信前にエラーにします。

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

`loadRemoteControl()` の戻り値には `supports(message)` もあります。送信・保存をせずに指定した設定を信号化できるか確認し、乾燥計画の候補を絞るために使えます。
