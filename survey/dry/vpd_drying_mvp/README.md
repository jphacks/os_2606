# 室内干しくん — VPD乾燥時間MVP

## 概要

温湿度から VPD（飽差）を計算し、乾燥時間を推定。数値係数は**実測10条件**（三菱電機 2024年の住宅実験の表4、約2.01kg・30点）から最小二乗で同定。各ケースの空気搬送の有無は混在しており、今回は説明変数に入れていません。よって家庭のエアコンの推奨設定を推定するモデルではありません。

出典: https://www.jstage.jst.go.jp/article/shasetaikai/2024.06/0/2024.06_113/_article/-char/ja

## 使用法

```bash
python3 model.py --compare
python3 model.py --temp 20 --rh 50
python3 model.py --temp 30 --rh 50 --allow-extrapolation
python3 -m unittest -v test_model.py
```

依存: Python 3.9+ / NumPy（`pip install numpy`）

## 数式

飽和水蒸気圧: `es(T) = 0.6108 exp(17.27T / (T+237.3))` (kPa)

`VPD = es(T) (1-RH/100)` (kPa)

モデルA: `drying_hours = alpha / VPD` (alpha is fitted). 0 kPa の場合は有限時間を算出しない。

比較モデルB: `log(drying_hours) = intercept + slope log(VPD)` (fitted).

比較モデルC: `drying_hours = intercept + bT + cRH` (fitted).

交差検証は **5ケースを1組ずつ除外**（同一ケースの空気搬送あり/なし2行を同時に除外）。MAEは時間単位。

## 限界（重要）

- T/RHは**乾燥期間中の平均**。開始時点のセンサー値を代入して正確な未来時間が分かるわけではない。
- 学習範囲: 15.8〜21.6°C、RH34.0〜57.7%。入力範囲を超える場合は標準で拒否し、`--allow-extrapolation`で外挿のみ許可する（精度保証なし）。
- 同一研究の約2kg・30点の混合衣類のみ。**Tシャツ・パーカー別の乾燥時間やエアコン運転モードを予測していない**。
- データには**空気搬送あり・なしが混在**している。これを説明しないVPD係数には交絡がある。
- 学習時と検証時が同じ論文内であり、他研究・家庭・高湿度・高温での精度は未検証。
- VPDは空気温度を布表面温度とみなす近似で、蒸発冷却や乾燥後半の影響は未モデル化。
- 95%終了保証やエアコン設定の推薦には使用しない。

## ファイル

- `model.py`: モデル学習・比較・CLI
- `observations.csv`: 実測10条件（論文の表4を転記した既存データからコピー）
- `test_model.py`: 基本テスト
- `evaluation.json`: 再計算した検証結果
