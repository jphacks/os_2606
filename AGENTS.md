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

### Conditional Branching and Type Safety

- Prefer `switch` statements over ternary operators for conditional branching.
- Avoid nested ternary operators.
- Use `switch` statements for branching based on discriminated unions, enums, or literal types.
- Prefer explicit control flow to improve readability and TypeScript type narrowing.
- Use exhaustive checks with the `never` type when handling discriminated unions.
- Use `if` statements for simple boolean conditions where a `switch` statement would be unnecessary.
- Prioritize readability and type safety over concise syntax.

Example:

```typescript
type Status = "idle" | "loading" | "success" | "error";

function getStatusMessage(status: Status): string {
  switch (status) {
    case "idle":
      return "待機中";
    case "loading":
      return "読み込み中";
    case "success":
      return "成功";
    case "error":
      return "エラー";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}
```
