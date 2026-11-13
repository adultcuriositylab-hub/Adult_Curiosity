# 公開準備版（Google側には未反映）

現在の新しい予約ページ（所有者限定）：
https://script.google.com/macros/s/AKfycbyyV7bjCJqwVWyQFpslT0u-svJuwQi0-TcZGSwc7UVtX96Wf7UP-DAUjdPk1GQ80HLR/exec

## ファイルの差し替え：長いコードの全選択削除は不要

1. 新しいプロジェクト「予約システム最新版」を使う。古い「予約ページ接続テスト」は保存する。
2. スクリプトファイルを追加し、名前をCodePublicにする。初期の短い関数のみ消し、CodePublic.gsを貼る。
3. 既存の「コード.gs」をファイルメニューから削除。同名関数の重複が残る間は実行しない。実行済みの旧デプロイは更新するまで旧版を使う。
4. HTMLファイルを追加し、名前をBookingPublicにする。初期の短いHTMLを消し、BookingPublic.htmlを貼る。BookingV2は残せる。
5. 保存しcheckSetupを実行。追加された外部通信の権限を確認する。
6. 既存の新しいデプロイを新バージョンに更新し、アクセスは「自分のみ」を維持。予約ページ上の「Turnstileのホスト名」をコピーする。

## Cloudflare Turnstile

- Managedのウィジェットを作る。最初の仮ホストはscript.google.com。まだ公開しない。
- 上記Google側のページで表示した正確な n-…-script.googleusercontent.com などのホスト名をTurnstileに登録し、仮ホストを削除する。登録対象はURLのドメイン部分のみ。googleusercontent.com全体を許可しない。
- キーをコードやGitHub、チャットに貼らない。
- Apps Scriptのプロジェクト設定→スクリプトプロパティに以下を保存：
  - TURNSTILE_SITE_KEY：Site Key
  - TURNSTILE_SECRET_KEY：Secret Key
  - TURNSTILE_HOSTNAME：上で登録した正確なホスト名
- enablePublicBookingsを所有者がエディタから実行する。テストキー・欠落設定は拒否する。
- デプロイのアクセスを「全員」に変更し、匿名ブラウザで確認する。
- ドメイン不一致、設定不足、操作確認失敗・期限切れ・通信失敗時は予約もメールも作らない。

## 最後の接続・実機確認

- Google未ログインで開けること、Turnstileが表示されて確認できること。
- 50分／100分、実技は対面のみ、税込の4料金、2枠は19時開始まで、前日20時の受付終了。
- 確認画面と双方のメールの日時・番号、カレンダーの50／100分、同時予約の競合。
- プライバシー・キャンセルポリシーへの共通チェック。確認前に両リンクを開いても入力が失われない。
- 成功後の同じ申し込みの再確認は、期限切れの操作確認でも受付記録だけを返し、イベント・メールを重複させない。
- 公開URLのまま既存サイトの予約リンクを接続する。現在はまだ接続しない。
- プライバシーポリシーの外部サービス欄にCloudflare Turnstile利用を反映してからサイトを更新する。
- 不具合時はdisablePublicBookingsを実行し、公開サイトの予約導線をメール受付へ戻す。

## 制限

既存の予約・カレンダー・メールにはアクセスしていない。42件の模擬バックエンドテストとブラウザでの模擬UIテストは通過。本物のTurnstile、本番Google権限、匿名Safariの動作は設定後に実機で確認する。
既存コードのownerOnly_は内部フラグで許可する公開入口だけを通し、従来の直接RPCは所有者限定を維持。APIはpublicAvailabilityとpublicReservation。後者はサーバー側でTurnstileのsuccess・action・cdata・hostnameを検証する。
投稿回数制限・メール残枠チェック・排他ロックは維持。これらは無制限の悪用や外部サービス障害を防ぎ切るものではない。
