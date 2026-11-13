# 相談カテゴリーと記事（未公開の下書き）

現在の公開サイトを元にした下書きです。公開用のcloudflare-siteブランチは変更していません。
予約・料金・画像・キャンセルポリシーなどは、現在の公開版を引き継ぎます。

## 本文を編集する

- `content/articles/` の各 `.txt` が記事本文です。日本語の普通の文章で編集できます。
- 空行を1行入れると段落が分かれます。行頭の `* ` は箇条書きとして表示します。HTMLなど、その他の記号は文字として表示します。
- `content/articles.json` でカテゴリー、タイトル、URL名（slug）、状態を管理しています。
- 本文が完成したら、その記事の `status` を `preparing` から `published` に変更します。
- `preparing` は「準備中」の表示と検索除外（noindex）を付けます。`published` では両方を外します。
- 本文内の見出しにしたい段落は、その文章を記事の `bodyHeadings` 配列へ登録します。その中の小見出しは `bodySubheadings` に登録できます。本文の文章自体はそのまま保持します。
- タイトルを変えても、既存の `slug` は変えなければURLは維持されます。

編集後、下のコマンドでトップページの記事一覧と記事ページをまとめて生成します。
Python 3だけで動きます。追加ライブラリのインストールは不要です。

```sh
python scripts/build_articles.py
```

例：`content/articles/unrequited-love-pain.txt` を編集すると、
`articles/unrequited-love-pain/index.html` が更新されます。
公開後のURLは `https://adult-curiosity.pages.dev/articles/unrequited-love-pain/` です。
現在はまだ公開されていません。

## 記事を追加する

1. `content/articles.json` の該当カテゴリーの `articles` に、次の形で1件追加します。
   `{"slug":"new-topic","title":"新しい記事タイトル","status":"preparing"}`
2. `content/articles/new-topic.txt` を作り、本文を入力します。
3. 上の生成コマンドを実行します。記事ページとカテゴリー内のリンクが一緒に追加されます。

slugとカテゴリーIDは半角英小文字・数字・ハイフンを使います。重複や本文ファイルの欠落は生成時にエラーにします。
生成済みHTMLを直接編集すると、次の生成で上書きされます。本文とタイトルはcontent内を編集してください。
記事を削除する場合は、一覧からの削除に加え、不要になった生成済みのarticles内のフォルダも削除します。

## 表示と確認

```sh
python -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開きます。
6カテゴリーは初期状態で閉じています。それぞれ独立して開閉でき、複数を開いたままにできます。
JavaScriptを無効にしても開閉と記事への移動ができます。
記事は仮の文章を入れた専用ページです。事実や専門的な本文は創作していません。

構造・編集・追加の確認：

```sh
python scripts/check_articles.py
```

ブラウザ確認（PlaywrightとChromiumがある開発環境）：

```sh
node scripts/test_articles.cjs
```

## 公開するとき

この下書きは自動公開しません。承認後に、生成した `index.html`、`articles/`、`assets/` と、現在の予約・ポリシーのHTMLを公開用 `site/` 配下へまとめて反映します。
Cloudflareの既存設定は変更していません。生成済みHTMLなので、現在の静的サイト用ビルド設定を維持できます。
本文が未完成のまま公開する場合も、18ページは準備中として機能します。
