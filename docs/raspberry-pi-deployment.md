# Raspberry Piへの自動デプロイ

`main`へのpushで、[GitHub Actions](../.github/workflows/deploy-raspberry-pi.yml)がビルド・テストしたコードをTailscale SSHでPiへ送り、`os2606-line.service`を更新します。
Tailscaleへの参加はOIDCで認証するため、Client SecretやSSH秘密鍵の登録は不要です。

配布先は固定の`/opt/os_2606/app`です。転送完了後にサービスを停止し、コードと本番依存関係を更新して再起動します。
systemdがHTTPの起動確認・Pi起動時の自動起動・異常終了時の再起動を行います。
更新中はサービスが停止します。世代管理や自動ロールバックは行いません。

## 1. Piの初回設定

Raspberry Pi OS 64bit、Node.js 22系（最低22.6）、pnpm 10.26.2、Tailscaleを用意します。
`node`と`pnpm`は`/usr/local/bin`など、非対話SSHでも利用できるPATHへ置いてください。
サービスのアクセス制限に合わせ、Node.jsと配布先は`/home`・`/tmp`・`/var/tmp`以外へ置いてください。
以下はPi上で、この変更を含むリポジトリのルートから実行します。

```sh
sudo apt update
sudo apt install -y curl
sudo corepack enable
# os2606がまだ存在しない場合に実行する。
sudo adduser --disabled-password --gecos '' os2606
sudo -u os2606 corepack prepare pnpm@10.26.2 --activate
sudo -u os2606 pnpm --version
sudo install -d -o os2606 -g os2606 -m 750 /opt/os_2606 /opt/os_2606/shared
if ! sudo test -e /opt/os_2606/shared/.env; then
  sudo install -o os2606 -g os2606 -m 600 .env.example /opt/os_2606/shared/.env
fi
sudo chmod 600 /opt/os_2606/shared/.env
sudoedit /opt/os_2606/shared/.env
```

**アプリの設定は`/opt/os_2606/shared/.env`の1ファイルだけです。** LINEの認証情報2項目を埋めれば起動できます。
GPIOとポートは変更する場合だけ編集してください。省略時も以下の既定値になります。

```dotenv
LINE_CHANNEL_SECRET=LINEのチャネルシークレット
LINE_CHANNEL_ACCESS_TOKEN=LINEのチャネルアクセストークン
PORT=3000
IR_RX_GPIO=17
IR_TX_GPIO=18
DHT_GPIO=4
```

systemdとセンサーCLIが同じ設定を使います。デプロイではこのファイルを上書きしません。
1行に`KEY=VALUE`を1つ書き、コメントは独立した行の先頭に`#`を付けます。`export`は不要です。

```sh
sudo install -o root -g root -m 644 deploy/systemd/os2606-line.service /etc/systemd/system/os2606-line.service
sudo visudo -cf deploy/systemd/os2606-line.sudoers
sudo install -o root -g root -m 440 deploy/systemd/os2606-line.sudoers /etc/sudoers.d/os2606-line
sudo systemctl daemon-reload
sudo systemctl enable os2606-line.service
```

初回はまだコードがないため、`--now`を付けません。最初のデプロイがサービスを起動します。
sudoの許可は、このサービスの停止・再起動だけです。
別のユーザー・配布先を使う場合は、サービス定義・sudoers・以下のVariablesを合わせてください。

旧手順で設定済みの場合は、`shared/line.env`のLINE認証情報と`PORT`を`shared/.env`へ移し、上のサービス定義を再登録してください。
既存のGPIO設定と`shared/data`はそのまま使用できます。旧`line.env`は新しいサービスでは読み込みません。
旧`current`・`previous`・`releases`は更新しません。

## 2. Tailscale

すでに設定済みなら、その設定を使用できます。
以下をAccess controlsの既存の`tagOwners`・`grants`・`ssh`へ追加し、MachinesでPiに`tag:os2606-pi`を付けます。

```json
{
  "tagOwners": {
    "tag:os2606-ci": ["autogroup:admin"],
    "tag:os2606-pi": ["autogroup:admin"]
  },
  "grants": [
    { "src": ["tag:os2606-ci"], "dst": ["tag:os2606-pi"], "ip": ["tcp:22"] }
  ],
  "ssh": [
    { "action": "accept", "src": ["tag:os2606-ci"], "dst": ["tag:os2606-pi"], "users": ["os2606"] }
  ]
}
```

**管理用PCからのSSH許可も残してください。** Piをタグ付きにすると`autogroup:self`には一致しません。
ユーザー所有のPCはログインIDを`src`に指定します。接続元が`tag:client`付きのMacなら、例えば既存の`ssh`配列へ次を追加します。
このルールは`tag:client`の全端末に適用されます。ネットワーク側でも管理端末からPiの`tcp:22`への接続を許可してください。
`<PI_SSH_USER>`は、Piに存在する管理用のLinuxユーザー名に置き換えてください。

```json
{ "action": "accept", "src": ["tag:client"], "dst": ["tag:os2606-pi"], "users": ["<PI_SSH_USER>"] }
```

設定後、Piで実行します。Tailscale IP宛ての22番ポートがTailscale SSHへ切り替わるため、初回はLAN側SSHかPi本体から行ってください。

```sh
sudo tailscale set --ssh
```

Tailscale管理画面の **Settings → Trust credentials → Credential → OpenID Connect** で資格情報を作成します。

| 項目 | 値 |
| --- | --- |
| Issuer | GitHub Actions（`https://token.actions.githubusercontent.com`） |
| Subject | `repo:jphacks@10176253/os_2606@1400412992:environment:raspberry-pi` |
| Custom claim: `ref` | `refs/heads/main` |
| Custom claim: `workflow_ref` | `jphacks/os_2606/.github/workflows/deploy-raspberry-pi.yml@refs/heads/main` |
| Scope | Auth Keys / Write（`auth_keys`） |
| Tag | `tag:os2606-ci` |

Subjectはこのリポジトリのimmutable subject設定に基づきます。数値IDも含めて指定してください。
生成されたClient IDとAudienceを、次のVariablesへ登録します。

## 3. GitHub Actions

**Settings → Environments** で`raspberry-pi`を作り、Deployment branchesを`main`に制限します。
自動実行するためRequired reviewersは設定せず、Environment variablesへ以下を登録します。

| Variable | 値 |
| --- | --- |
| `RPI_HOST` | PiのTailscale名またはIPv4アドレス |
| `RPI_USER` | デプロイ・サービス用のLinuxユーザー名（既定の手順では`os2606`） |
| `TS_CLIENT_ID` | TailscaleのOIDC Client ID |
| `TS_AUDIENCE` | Tailscaleが表示したAudience |
| `RPI_DEPLOY_PATH` | 任意。未指定時は`/opt/os_2606`。作成済みでユーザーが書き込めるディレクトリ |

配布先を変更した場合は、サービス定義内の`/opt/os_2606`も同じパスへ変更します。パスに空白は使えません。
設定後に変更を`main`へ取り込むと自動実行されます。手動実行は **Actions → Deploy to Raspberry Pi → Run workflow → main** です。
古いコミットの再実行はスキップします。

## 動作確認と更新失敗時

Pi上で確認します。

```sh
systemctl status os2606-line.service
sudo journalctl -u os2606-line.service -n 50 --no-pager
curl --fail http://127.0.0.1:3000/healthz
```

設定を変更するときも、この2コマンドだけです。

```sh
sudoedit /opt/os_2606/shared/.env
sudo systemctl restart os2606-line.service
```

配布にはビルド済みコードと依存関係の定義だけを含め、`node_modules`はPiで導入します。
設定とデータは`shared/.env`・`shared/data`に残り、`app/.env`・`app/data`から参照できます。
CLIは`cd /opt/os_2606/app`してから実行してください。
GPIO番号を変更した場合は、配線と`/boot/firmware/config.txt`も合わせてPiを再起動します。
詳細は[センサーのREADME](../packages/sensor/README.md)、LINEの公開HTTPS URLは[LINEのREADME](../packages/line/README.md#lineとの接続)を参照してください。

転送やアーカイブの検査で失敗した場合は、現行サービスを停止しません。
更新開始後に依存関係の導入や起動確認が失敗した場合は、原因を修正してActionsを再実行してください。
コードを戻す場合は`main`で変更をrevertして再デプロイします。旧コードへの自動復旧は行いません。

参考: [Tailscale OIDC](https://tailscale.com/docs/features/workload-identity-federation)、[Tailscale SSH](https://tailscale.com/docs/features/tailscale-ssh)、[pnpm install](https://pnpm.io/10.x/cli/install)。
