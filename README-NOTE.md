# noteの新着記事の自動表示

プロフィール：https://note.com/adult_curiosity
RSS：https://note.com/adult_curiosity/rss

トップの「大人の自由研究」の後ろへ「noteの新着記事」を追加。最新3記事のタイトル・冒頭の1文（長い場合は最大120文字と省略記号）・日付・続きを読むを表示する。本文はnoteで読む。既存の18記事・料金・予約は変更しない。

## 更新の仕組み

- Pages Function `/api/note` が固定のRSSを取得し、JSONだけを返す。ブラウザから外部RSSを直接読まない。
- 配信元は固定。利用者から指定するRSS URLは受け付けない。記事リンクも本人のnote記事に限定する。
- RSSの本文に含まれるHTMLはテキスト化。フロントもtextContentで表示する。DOCTYPE・外部エンティティ宣言を拒否し、読み取りは1MiB・8秒に制限。
- 最新3件を日付順に表示。RSSに冒頭文がなければ捏造せず、タイトルと続きを読むだけを出す。
- エッジで5分間キャッシュ。古いキャッシュがあれば表示しつつ更新する。最大24時間の前回データで一時障害に耐える。
- ブラウザは5分おき、またはタブへ戻った際に再取得する。note側の配信遅延・キャッシュにより即時反映ではない（目安5〜10分）。
- 取得不能・未投稿の場合も、noteプロフィールへのボタンは常に表示する。
- 一度設置した後は、noteの投稿・更新だけでサイトの記事欄が更新される。記事ごとのGit変更・サイト再ビルドは不要。
- Functionsのルートを/api/noteだけに制限し、通常のページ・画像・予約は静的配信を維持する。

## ファイルと公開

functions/ と server/、package.json / package-lock.json はリポジトリのルート。
静的ファイルは既存のsite/。Cloudflareの既存設定（ビルドコマンドexit 0、出力site）を維持する。
Draftブランチでも配布用のassetはroot/assets、index.htmlとprivacy.htmlを編集できるよう同じものを保存する。

## 検証

- `npm ci --ignore-scripts` 後、`node tests/note-feed.test.js`
- GitHub Actions「Verify automatic note feed」は関係するコードの公開時だけ実行。公開URLのAPIが実際のRSSを処理してJSONを返すことを確認する。noteの投稿時には実行しない。
- 追加のAPIキー・外部連携サービス・Googleスクリプト変更は不要。
