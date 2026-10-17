## Git & Commit Conventions

- Commit messages must be written in Japanese.
- Keep commit messages concise and clearly describe the changes.
- Each commit should represent a single logical change whenever possible.
- Follow the Conventional Commits format.
- Commit prefixes (e.g., feat, fix, refactor, docs, test, chore) may remain in English, but descriptions must be written in Japanese.
- Do not include unrelated changes in a commit.
- Do not create commits unless explicitly instructed by the user.

### Commit Message Examples

- `feat: 洗濯物の乾燥時間を予測するAPIを追加`
- `fix: 温度が未指定の場合にエラーが発生する問題を修正`
- `refactor: 乾燥時間の計算処理を関数に分離`
- `docs: APIの使用方法をREADMEに追加`
- `test: 乾燥時間の予測処理に単体テストを追加`
- `chore: TypeScriptの設定を更新`