# GitHub Copilot への指示

## 言語

- **すべての応答・レビューコメント・提案は必ず日本語で書いてください。**
- コード中の識別子や英語の固有名詞（ライブラリ名・エラーメッセージなど）はそのままで構いません。

## プロジェクト概要

- pnpm workspaces による TypeScript モノレポです（Node.js >= 22, pnpm >= 10）。
- パッケージ構成: `packages/core`, `packages/line`, `packages/sensor`, `packages/api`
- ビルドは `tsc -b`（Project References）、テストは Vitest を使用しています。
- `tsconfig.base.json` で `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` などの厳格な設定を有効にしています。

## PR レビューの方針

### 優先して見てほしい観点（重要度順）

1. **バグ・正しさ**: ロジックの誤り、境界値、null/undefined の扱い、非同期処理の待ち忘れ（`await` 漏れ・未処理の Promise）、例外処理の漏れ
2. **セキュリティ**: API キーやトークンなどの秘密情報のハードコード・コミット、外部入力の未検証、LINE Webhook などの署名検証漏れ
3. **型安全性**: `any` や不要な型アサーション（`as`）、`!`（non-null assertion）の多用、`@ts-ignore` の使用
4. **パッケージ間の依存**: 循環依存がないか、`core` に他パッケージ固有の処理が入り込んでいないか、`tsconfig.json` の `references` と `package.json` の依存が整合しているか
5. **テスト**: 変更したロジックに対応するテストがあるか、テストが実装の詳細に依存しすぎていないか
6. **可読性・保守性**: 命名、関数の責務、重複コード

### TypeScript / ESM の注意点

- `verbatimModuleSyntax` が有効なため、型のみの import は `import type` を使っているか確認してください。
- `module: NodeNext` のため、相対 import に拡張子（`.js`）が付いているか確認してください。
- `noUncheckedIndexedAccess` により配列・Record のアクセス結果は `T | undefined` になるため、適切にガードしているか確認してください。

### コメントの書き方

- 指摘には重要度を先頭に付けてください。
  - `[must]` マージ前に必ず直すべき問題（バグ・セキュリティ等）
  - `[should]` 直した方がよいが、理由があれば見送り可
  - `[nits]` 細かい好みやスタイルの指摘
  - `[question]` 意図の確認
- 「なぜ問題か」と「どう直すか」をセットで書き、可能であれば修正案のコードを提示してください。
- 根拠のない推測や、フォーマッタで解決できる程度の指摘は控えてください。
- 良い変更があれば簡潔に褒めても構いません。

### 対象外

- `dist/`, `node_modules/`, `*.tsbuildinfo`, `pnpm-lock.yaml` などの生成物はレビュー対象外です（ただし、生成物が誤ってコミットされている場合は指摘してください）。

## 補足

- 本リポジトリはハッカソン（JPHACKS）向けのプロジェクトです。完璧さよりも動くことを優先する場面もあるため、過度な抽象化や大規模なリファクタリングの提案は控えめにしてください。
