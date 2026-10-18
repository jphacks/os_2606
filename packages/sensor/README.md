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

読み取りに失敗した場合は、標準エラー出力に原因を表示して終了コード1を返します。

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
DHT11は読み取りに失敗することがあり、その場合は`measure()`がrejectします。
呼び出し側でエラーを処理し、次の測定まで2秒以上空けてください。

ドライバー設定は[Raspberry PiのDHT11 overlay](https://github.com/raspberrypi/linux/blob/rpi-6.18.y/arch/arm/boot/dts/overlays/dht11-overlay.dts)、測定値の単位と保持期間は[LinuxのDHT11ドライバー](https://github.com/raspberrypi/linux/blob/rpi-6.18.y/drivers/iio/humidity/dht11.c)に基づいています。

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
test -e .env || cp .env.example .env
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
