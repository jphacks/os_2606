# 室内干しくんの乾燥制御

`@os/core` はHTTP・DB・センサー・RemoteControlに依存しない純粋関数を公開します。
既存のモノレポ構成に合わせ、実装先は `packages/core/src/drying/` です。

```typescript
import {
  decideNextOperation,
  DEFAULT_DRYING_CONFIG,
  evaluateOperations,
  generateOperationCandidates,
} from "@os/core";

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

const candidates = generateOperationCandidates(context, config);
const evaluated = evaluateOperations(context, config);
const decision = decideNextOperation(context, config);
```

設定変更はデフォルト設定をコピーし、変更する入れ子の設定もコピーして渡してください。
冷房22〜28℃・暖房20〜26℃がデフォルトです。`temperatureRanges` のmin/max/stepで
実機の温度範囲と刻みを制限します。安全上、命令温度の絶対範囲は16〜28℃です。
除湿の温度は現在室温相当とし、この安全範囲を超える場合は端で制限します。
送風モードはありません。在室中にoffは生成せず、対応する運転候補がない場合は例外です。
快適温度の省略時は24℃。外出中の基準温度は現在室温です。

## モデルと限界

- 飽和水蒸気圧は `0.6108 * exp(17.27*T/(T+237.3))` kPa、VPDはその値に
  `(1-RH/100)` を掛けた値です。乾燥時間は `10.5035/VPD` 時間です。
  24℃・70%では約11.733時間、RH100%ではInfinityを返します。
- `survey/dry/vpd_drying_mvp` の実体はこのチェックアウトにありません。
  提示された式を採用し、Pythonのmath.expで計算した参照値をテストしています。
- 進捗はVPDの時間積分を10.5035で割った未校正推定です。衣類の含水率でも、
  実際の乾燥完了判定でもありません。写真・衣類量・生地・水分供給は考慮しません。
- 次の60分を15分刻みで予測します。予報はその区間を代表する外気温湿度を渡します。
  外気との交換、設定温度への応答、除湿、風量倍率はすべて暫定係数で、
  `simulator` から変更できます。冷房が暖房、暖房が冷房として働かないよう制限します。
- 水蒸気圧を内部状態に使います。暖房は外気交換を除き水蒸気を増減させません。
  冷房・除湿は指数的に減らします。飽和超過は凝結として除去します。
  実機能力や電力量は算出せず、風向きの最適化もしません。
- 進捗と温度二乗誤差は各刻みの両端を使う台形積分です。進捗は残り量で上限を設けます。
  温度ペナルティは区間の平均二乗誤差です。在室中は風量の快適性ペナルティも足します。
  `score = -w * (gain/maxGain) + (1-w) * (temperaturePenalty + fanComfortPenalty)`。
  最大進捗が0なら正規化値は0。同点は現在室温に近い設定温度、さらに同じなら候補生成順です。
- 有限な入力のみ許可します（温度−60〜60℃、RH0〜100%、進捗0〜1）。
  `estimateDryingHours` のInfinityは飽和時の意図した出力であり、不正入力は拒否します。

## 観測進捗と定期実行

`updateObservedProgress` は時刻付きの前回・今回の実測VPDを台形積分します。
`decision.estimatedProgressGain` は今後の予測なので、保存済み進捗には加算しません。
観測間の実際の変動は不明であり、観測進捗も推定です。

`@os/api` の `runDryingCycle(dependencies, options)` をCron等から呼び出してください。
Cronや天気予報APIクライアント自体は含めません。以下の依存を注入します。

- `readIndoor()`：温湿度と実測時刻（エポックミリ秒）
- `readForecast()`：次の1時間を代表する最新の外気温湿度
- `store`：`load`、`save`、処理全体を排他する `withLock`。初期状態は `{ dryingProgress: 0 }`
- `remoteControl`：既存の `send` / `stop` インターフェース
- `now()`：現在時刻（エポックミリ秒）

```typescript
// dependenciesには上記の実装を注入する。
await runDryingCycle(dependencies, {
  presenceMode: "home",
  comfortTemperature: 24,
  windDirectionVertical: "down",
  windDirectionHorizontal: "left",
});
```

風向きは住宅設定の既存値を渡します。上下と運転モード、左右と洗濯物位置の対応付けは
呼び出し側が行います。LINEの外出・帰宅処理も在室状態を保存してこの処理へ渡せます。
帰宅時もエアコンを停止しません。LINEハンドラー・通知・画像解析はここには含めません。

判断を `pending` として保存してから実機へ送り、成功後に観測進捗・観測点・
`lastApplied` を保存します。送信失敗時は `failed` として旧進捗・旧観測点を保持します。
初回の観測前には進捗を加算しません。保存と送信は原子的ではないため、
中断や送信後の保存失敗ではpendingが残ります。pending/failedの次回評価では
実機状態が不確実とみなし再送します。IRの成功は実機の受信確認とは異なります。

同じ命令の再送を省略し、モード変更は最後の成功送信から最低30分間保留します
（`minimumModeMinutes`で変更可能）。帰宅時の停止から運転への変更は即時に行います。
保留時も `decision` は最新の推奨、`lastApplied` は送信済み命令として区別します。
温度や風量だけの変更にはモード変更の待ち時間を適用しません。
ストアの排他・永続化、予報や観測の鮮度保証、再試行のスケジュールは呼び出し側で提供します。
進捗1でも実際の乾燥完了は保証しないため、自動停止や完了通知はここでは行いません。

## 検証

`pnpm build`、`pnpm typecheck`、`pnpm test` をリポジトリルートで実行します。
