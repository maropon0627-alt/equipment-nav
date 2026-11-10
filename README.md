# 設備保全ナビ（PoC）

HTML / CSS / JavaScript のみ。サーバー・ビルド不要。

## GitHub Pages への配置
1. GitHub に `equipment-nav` リポジトリを作成し、このフォルダの中身をすべてルートに置く（ブラウザでのアップロードでも可。フォルダは使わない）
2. Settings → Pages → Branch: `main` / `(root)` を選んで保存
3. `https://<ユーザー名>.github.io/equipment-nav/#/CR001` を iPhone の Safari で開いて確認

※ HTTPS が必須（GitHub Pages は自動で HTTPS）。ローカル確認は `python3 -m http.server` → `http://localhost:8000/`

## QRコード
内容は `https://<ユーザー名>.github.io/equipment-nav/#/設備番号`（例：`#/CR001`）。
iPhone標準カメラで読み取ると Safari で開く。ホーム画面に追加したアプリは QR のURLを引き継がないため、
QR からは Safari で開き、普段使いはホーム画面アイコンから検索する運用。

## ホーム画面に追加
Safari → 共有ボタン → 「ホーム画面に追加」

## データの更新
`equipment.json` / `repairs.json` を差し替えて公開するだけ（通信できる時は常に最新を取得）。
図面・写真・報告書はすべて index.html と同じ場所（ルート）に置き、JSON にはファイル名だけを書く（フォルダ構成にする場合は `drawings/xxx.pdf` のように相対パスで指定）。
アプリ本体（app.js など）を変えたら `service-worker.js` の `VERSION` を上げる。

## 注意
- 同梱の図面・写真・報告書・設備データはすべてサンプル。
- GitHub Pages は公開サイト。**実際の図面・設備情報は置かないこと**（PoC は架空データで検証し、本番は非公開の配信先を検討）。
