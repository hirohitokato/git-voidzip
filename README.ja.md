# git-voidzip

`git-voidzip` は、Git のツリーから ZIP アーカイブを作成しつつ、画像・音声・動画・フォント・Office 文書・その他のバイナリファイルを 0 バイトの空ファイルに置き換える Node.js 製 CLI です。

ソースコードの構成は維持したまま共有したいが、大きなバイナリアセットや不要なメディアファイルは含めたくない、という用途を想定しています。

## 特長

- Git の ref、ブランチ、タグ、コミットから ZIP を作成できます。
- 元のディレクトリ構造とファイル名を維持します。
- 指定条件に一致するバイナリ/メディアファイルを 0 バイトの空ファイルに置換します。
- `git archive --prefix` に似た `--prefix` オプションを提供します。
- ZIP 全体をメモリに構築せず、`fs.createWriteStream()` で逐次書き出します。
- Node.js 標準ライブラリのみで動作します。実行時の npm 依存はありません。

## 必要条件

- Node.js 18 以上
- `PATH` 上で利用可能な Git
- 有効な Git リポジトリ

## インストール

### ローカルで使う場合

```sh
git clone https://github.com/YOUR_NAME/git-voidzip.git
cd git-voidzip
npm install
npm link
```

その後、次のように実行できます。

```sh
git-voidzip --output source.zip
```

### `npm link` なしで使う場合

```sh
node bin/git-voidzip.js --output source.zip
```

## 使い方

```sh
git-voidzip --output source.zip
```

```sh
git-voidzip --repo . --ref HEAD --prefix my-project/ --output my-project.zip
```

```sh
git-voidzip --repo /path/to/repo --ref main --mode both --output archive.zip
```

## オプション

| オプション           |   必須 | 既定値 | 説明                                                                  |
| -------------------- | -----: | -----: | --------------------------------------------------------------------- |
| `--repo <path>`      | いいえ |    `.` | Git リポジトリのパスです。                                            |
| `--ref <ref>`        | いいえ | `HEAD` | アーカイブ対象の Git ref、ブランチ、タグ、コミットです。              |
| `-o, --output <zip>` |   はい |      - | 出力する ZIP ファイルのパスです。                                     |
| `--prefix <path/>`   | いいえ |     空 | ZIP 内の先頭ディレクトリです。`git archive --prefix` に近い動作です。 |
| `--mode <mode>`      | いいえ | `both` | 置換モードです。`media`、`binary`、`both` のいずれかです。            |
| `-h, --help`         | いいえ |      - | ヘルプを表示します。                                                  |

## 置換モード

| モード   | 動作                                                                        |
| -------- | --------------------------------------------------------------------------- |
| `media`  | 既知のメディア/バイナリ系拡張子に一致するファイルを空ファイルに置換します。 |
| `binary` | 内容がバイナリに見えるファイルを空ファイルに置換します。                    |
| `both`   | `media` と `binary` の両方の条件を適用します。                              |

## 拡張子による置換対象

既定の `media` 判定には、以下のような拡張子が含まれます。

- 画像: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tiff`, `.ico`, `.avif`, `.heic` など
- 音声: `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a`, `.ogg`, `.opus` など
- 動画: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.mpeg` など
- フォント: `.ttf`, `.otf`, `.woff`, `.woff2`, `.eot`
- アーカイブ: `.zip`, `.tar`, `.gz`, `.tgz`, `.7z`, `.rar` など
- Office/文書: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- その他のバイナリ: `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.dat`, `.wasm`

## バイナリ判定

`--mode binary` または `--mode both` を指定した場合、各ファイルの先頭部分を読み取り、NUL バイトが含まれていればバイナリファイルと判定します。

これは単純で保守的なヒューリスティックです。典型的なバイナリペイロードの除外には有効ですが、完全な MIME タイプ判定を目的としたものではありません。

## メモリ使用特性

このツールは `fs.createWriteStream()` を使って ZIP を逐次書き出します。

ただし、現在の実装では 1 ファイル単位ではメモリに読み込み、圧縮も 1 ファイル単位で行います。

| データ                | メモリ保持 |
| --------------------- | ---------- |
| ZIP 全体              | しない     |
| 全ファイル内容        | しない     |
| 1 ファイルの blob     | する       |
| 1 ファイルの圧縮結果  | する       |
| ZIP central directory | する       |

一般的なソースコードリポジトリでは、ZIP 全体を単一のバッファとして構築する方式よりもメモリ効率が高くなります。単体で非常に大きいテキストファイルを含むリポジトリでは、ZIP data descriptor とストリーミング圧縮を使う実装が今後の改善候補です。

## 制限事項

- ZIP64 には未対応です。
- ZIP central directory は最後までメモリ上に保持します。
- 置換対象外の各ファイルは、1 ファイル単位でメモリに読み込み、圧縮します。
- ファイルのタイムスタンプは Git のコミット時刻ではなく、実行時刻になります。
- Git submodule の中身は展開しません。
- 指定した Git ツリーに含まれる tracked file のみを対象にします。未追跡の作業ツリーファイルは含みません。

## 例

```sh
git-voidzip \
  --repo . \
  --ref HEAD \
  --prefix my-project/ \
  --output my-project.zip
```

結果を確認します。

```sh
unzip -l my-project.zip
```

画像や動画などの対象ファイルは ZIP 内に存在しますが、サイズは `0` になります。

## 開発

スモークテストを実行します。

```sh
npm test
```

## ライセンス

MIT
