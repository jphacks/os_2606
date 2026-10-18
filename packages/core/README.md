# 室内干しくんの乾燥制御

運転計画の入口は **`@os/core/drying` の `decideNextOperation(context, config?)`** です。
温湿度・在室状態・乾燥進捗を渡すと、次の評価までの運転計画を同期的に返します。
同じ入力と設定なら同じ結果を返し、入力や設定を変更しません。
センサー取得・時刻取得・ファイル読み書き・実機操作は呼び出し側で行います。

公開 API の定義は `src/drying/index.ts`、計画の実装は `src/drying/operation-planner.ts` です。
運転計画の関数・型は `@os/core/drying` から import してください。
`decideNextOperation` は `@os/core` からも名前付きで公開しています。

## 開始時に1回だけ使う

最初の実装では、洗濯開始時に1回呼ぶだけで運転設定と推定残り乾燥時間を取得できます。
`dryingProgress` は省略すると `0` として扱うため、観測履歴や進捗の保存は不要です。

```typescript
import { decideNextOperation } from "@os/core/drying";

const plan = decideNextOperation({
  indoorTemperature: 24,
  indoorHumidity: 70,
  outdoorTemperature: 18,
  outdoorHumidity: 60,
  presenceMode: "home",
  comfortTemperature: 24,
});

// plan.mode: "cool" | "heat" | "dehumidify" | "off"
// plan.temperature / plan.fanSpeed: 運転時の設定。停止時は省略。
// plan.estimatedDryingHours: 乾くまでの推定残り時間（時間）。
```

呼び出し側で返された設定を実機へ送り、残り時間を表示します。
この関数自体は実機への送信、タイマーによる停止、定期再評価を行いません。
1回だけ呼ぶ場合、残り時間は開始時点の予測であり、その後の環境変化には追従しません。
定期再評価を追加するときは、観測から更新した `dryingProgress` を渡せます。

返すのは次の区間の計画1件です。複数時間にわたる運転スケジュールではありません。
`estimatedDryingHours` は、選んだ設定と外気条件を固定し、現在の温湿度・進捗から
`config.stepMinutes`（標準15分）ごとに予測を進め、進捗1へ到達するまでの時間を返します。
温湿度の過渡変化も反映します。区間途中の完了は補間せず、完了した刻みの終了時刻を返します。
最大7日間（168時間）の予測内で完了しなければInfinityです。これは乾燥不能の断定ではありません。
進捗1では在室状態や乾燥中の停止候補の許可にかかわらず、停止と残り0時間を返します。
再評価の間隔は `config.evaluationMinutes`（標準60分）を使ってください。
入力・設定が不正な場合や、未完了なのに対応する運転候補がない場合は `RangeError` を投げます。

## 設定

`@os/core/drying` が公開する値は `decideNextOperation` と `DEFAULT_DRYING_CONFIG` の2つです。
入出力と設定に必要な型も公開します。候補生成・評価・シミュレーション・VPD計算は内部実装です。

```typescript
import {
  decideNextOperation,
  DEFAULT_DRYING_CONFIG,
} from "@os/core/drying";

const context = {
  indoorTemperature: 24,
  indoorHumidity: 70,
  outdoorTemperature: 18,
  outdoorHumidity: 60,
  presenceMode: "home" as const,
  comfortTemperature: 24,
  dryingProgress: 0,
};

const config = {
  ...DEFAULT_DRYING_CONFIG,
  dryingWeight: 0.7,
  // 実機に除湿・風量調整がない場合などは、その候補を除外する。
  capabilities: {
    modes: ["cool", "heat"] as const,
    fanSpeeds: { cool: ["low", "high"] as const, heat: ["low"] as const, dehumidify: [] },
    allowOff: true,
  },
};

const decision = decideNextOperation(context, config);
```

設定変更はデフォルト設定をコピーし、変更する入れ子の設定もコピーして渡してください。
冷房22〜28℃・暖房20〜26℃がデフォルトです。`temperatureRanges` のmin/max/stepで
実機の温度範囲と刻みを制限します。安全上、命令温度の絶対範囲は16〜28℃です。
除湿の温度は現在室温相当とし、この安全範囲を超える場合は端で制限します。
送風モードはありません。乾燥中は在室中にoffを候補として生成せず、対応する運転候補がない場合は例外です。
快適温度の省略時は24℃。外出中の基準温度は現在室温です。

## モデルと限界

- 飽和水蒸気圧は `0.6108 * exp(17.27*T/(T+237.3))` kPa、VPDはその値に
  `(1-RH/100)` を掛けた値です。乾燥時間は `10.5035/VPD` 時間です。
  24℃・70%では約11.733時間、RH100%ではInfinityを返します。
- `survey/dry/vpd_drying_mvp` の実体はこのチェックアウトにありません。
  提示された式を採用し、Pythonのmath.expで計算した参照値をテストしています。
- 進捗はVPDの時間積分を10.5035で割った未校正推定です。衣類の含水率でも、
  実際の乾燥完了判定でもありません。写真・衣類量・生地・水分供給は考慮しません。
- 候補の採点は次の60分を15分刻みで予測します。完了時間の計算は選んだ運転をその先も継続します。
  外気温湿度は両方の予測を通して一定と仮定します。
  外気との交換、設定温度への応答、除湿、風量倍率はすべて暫定係数で、
  `simulator` から変更できます。冷房が暖房、暖房が冷房として働かないよう制限します。
- 水蒸気圧を内部状態に使います。暖房は外気交換を除き水蒸気を増減させません。
  冷房・除湿は指数的に減らします。飽和超過は凝結として除去します。
  実機能力や電力量は算出せず、風向きの最適化もしません。
- 進捗と温度二乗誤差は各刻みの両端を使う台形積分です。進捗は残り量で上限を設けます。
  温度ペナルティは区間の平均二乗誤差です。温度差2℃の二乗を基準に割り、
  在室中の風量ペナルティを足した値を `d` として、快適性も `d/(1+d)` で0〜1未満へ正規化します。
  風量ペナルティが0なら、温度の二乗平均平方根誤差が2℃のとき快適性ペナルティは0.5です。
  `score = -w * (gain/maxGain) + (1-w) * d/(1+d)`。
  最大進捗が0なら正規化値は0。同点は現在室温に近い設定温度、さらに同じなら候補生成順です。
- 有限な入力のみ許可します（温度−60〜60℃、RH0〜100%、進捗0〜1）。
  `estimateDryingHours` のInfinityは飽和時の意図した出力であり、不正入力は拒否します。

## 観測進捗

観測進捗の更新に使う `updateObservedProgress` は、
既存の利用のため `@os/core` から公開しています（`@os/core/drying` には含めません）。
`updateObservedProgress` は時刻付きの前回・今回の実測VPDを台形積分します。
運転計画の推定残り時間から、保存済みの観測進捗を更新することはありません。
観測間の実際の変動は不明であり、観測進捗も推定です。

```typescript
import { updateObservedProgress } from "@os/core";

const dryingProgress = updateObservedProgress(
  0.2,
  { temperature: 24, humidity: 70, observedAt: 0 },
  { temperature: 26, humidity: 60, observedAt: 3_600_000 },
);
```

返り値は上限1の推定進捗です。更新した値を `decideNextOperation` の
`context.dryingProgress` に渡します。観測値の取得、進捗・観測値の保存、
定期実行と実機操作は呼び出し側で行います。

## LINE handler から乾燥サイクルを動かす

`@os/core/cycle` の `createCycle` は、handler から呼ぶ `startDrying()`（洗濯したよ）、
`leaveHouse()`（行ってきます）、`arriveHouse()`（ただいま）を返します。
メッセージの解析と LINE への送信は handler 側の責務です。
アプリケーション起動時に1つ作り、handler 間で共有してください。

```typescript
import { createCycle } from "@os/core/cycle";

const cycle = createCycle({
  // 室内センサー・外気データから DryingContext の環境条件を返す。
  getContext: async () => ({
    indoorTemperature: 24,
    indoorHumidity: 70,
    outdoorTemperature: 18,
    outdoorHumidity: 60,
    comfortTemperature: 24,
  }),
  remoteControl,
  onFinishDrying: () => lineApi.sendNotificationFinishDrying(),
  onError: (error) => console.error("乾燥サイクルの完了処理に失敗", error),
});

// LINE handler 内の該当する分岐から呼ぶ。
await cycle.startDrying(); // 「洗濯したよ」で室内モードから開始。
await cycle.leaveHouse(); // 洗濯済みとして外出モードで開始、または乾燥中のモード切り替え。
await cycle.arriveHouse();

// アプリケーション終了時。
await cycle.dispose();
```

「洗濯したよ」で室内モード・乾燥進捗0から運転を開始します。「行ってきます」は洗濯済みとして扱い、
未開始・完了後なら外出モード・進捗0から開始します。乾燥中に在室状態が変わると
実測温湿度から進捗を引き継いで再計画します。開始前・完了後の帰宅では運転を開始しません。
乾燥中の「洗濯したよ」や同じ在室状態の通知は重複として扱い、終了時刻を延長しません。
予測終了時刻を毎分 cron（`* * * * *`）で確認し、エアコン停止後に完了コールバックを呼びます。
通知は予測時刻以降の次の cron 実行時です。Infinity の予測では通知しません。
停止・通知の失敗は `onError` に渡し、次の cron で再試行します。停止済みなら通知だけを再試行します。
handler からの取得・送信エラーは handler に返します。通知先で受信後に通信が失敗した場合などは、
再試行によって通知が重複する可能性があります。

状態はメモリ内です。単一プロセスで常駐させる必要があり、再起動時には復元されません。
完了後は次の「洗濯したよ」または「行ってきます」で新しいサイクルを開始します。
`dispose()` は cron だけを破棄します。

テストでは入出力に加えて、第2引数で時計・予測・スケジューラを個別に DI できます。
モジュールのモックや実時間の待機は不要です。具体例は `test/cycle.test.ts` を参照してください。

```typescript
let tick: () => Promise<void> = async () => {};
let now = 0;
const cycle = createCycle(options, {
  now: () => now,
  decideNextOperation: () => ({
    mode: "heat", temperature: 26, fanSpeed: "high", estimatedDryingHours: 1,
  }),
  createTask: (_expression, callback) => {
    tick = callback;
    return { start() {}, stop() {}, destroy() {} };
  },
});
await cycle.startDrying();
now = 3_600_000;
await tick(); // モックの停止・完了コールバックを検証できる。
await cycle.dispose();
```

## 検証

`pnpm build`、`pnpm typecheck`、`pnpm test` をリポジトリルートで実行します。
