# git-voidzip

`git-voidzip` is a small Node.js CLI that creates a ZIP archive from a Git tree while replacing media and binary files with empty files.

It is useful when you want to share source code while preserving the repository structure, but do not want to include large or sensitive binary assets such as images, audio, video, fonts, archives, Office documents, or other binary payloads.

## Features

- Creates a ZIP archive from a Git ref, branch, tag, or commit.
- Keeps the original directory and file structure.
- Replaces selected binary/media files with 0-byte files.
- Supports a `--prefix` option similar to `git archive --prefix`.
- Streams the ZIP output with `fs.createWriteStream()` instead of building the entire ZIP file in memory.
- Uses only Node.js built-in modules. No runtime npm dependencies.

## Requirements

- Node.js 18 or later
- Git available in `PATH`
- A valid Git repository

## Installation

### Local use

```sh
git clone https://github.com/YOUR_NAME/git-voidzip.git
cd git-voidzip
npm install
npm link
```

Then run:

```sh
git-voidzip --output source.zip
```

### Without linking

```sh
node bin/git-voidzip.js --output source.zip
```

## Usage

```sh
git-voidzip --output source.zip
```

```sh
git-voidzip --repo . --ref HEAD --prefix my-project/ --output my-project.zip
```

```sh
git-voidzip --repo /path/to/repo --ref main --mode both --output archive.zip
```

## Options

| Option               | Required | Default | Description                                                                 |
| -------------------- | -------: | ------: | --------------------------------------------------------------------------- |
| `--repo <path>`      |       No |     `.` | Path to the Git repository.                                                 |
| `--ref <ref>`        |       No |  `HEAD` | Git ref, branch, tag, or commit to archive.                                 |
| `-o, --output <zip>` |      Yes |       - | Output ZIP file path.                                                       |
| `--prefix <path/>`   |       No |   empty | Prefix directory inside the ZIP archive. Similar to `git archive --prefix`. |
| `--mode <mode>`      |       No |  `both` | Scrubbing mode. One of `media`, `binary`, or `both`.                        |
| `-h, --help`         |       No |       - | Show help.                                                                  |

## Scrubbing modes

| Mode     | Behavior                                                                  |
| -------- | ------------------------------------------------------------------------- |
| `media`  | Replaces files with known media/binary-style extensions with empty files. |
| `binary` | Replaces files whose content appears binary with empty files.             |
| `both`   | Applies both `media` and `binary` rules.                                  |

## File types replaced by extension

The default media rule includes common extensions for:

- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tiff`, `.ico`, `.avif`, `.heic`, and others
- Audio: `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a`, `.ogg`, `.opus`, and others
- Video: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.mpeg`, and others
- Fonts: `.ttf`, `.otf`, `.woff`, `.woff2`, `.eot`
- Archives: `.zip`, `.tar`, `.gz`, `.tgz`, `.7z`, `.rar`, and others
- Office/documents: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- Other binary artifacts: `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.dat`, `.wasm`

## Binary detection

When `--mode binary` or `--mode both` is used, the tool reads the beginning of each file and treats it as binary if a NUL byte is found.

This is a simple and conservative heuristic. It is suitable for avoiding typical binary payloads, but it is not intended to be a full MIME-type detector.

## Memory behavior

This tool writes the ZIP archive incrementally using `fs.createWriteStream()`.

However, the current implementation still loads and compresses one file at a time in memory.

| Data                        | Memory behavior    |
| --------------------------- | ------------------ |
| Entire ZIP archive          | Not held in memory |
| All file contents           | Not held in memory |
| One file blob               | Held in memory     |
| One compressed file payload | Held in memory     |
| ZIP central directory       | Held in memory     |

For most source repositories, this is significantly more memory-efficient than constructing the entire ZIP as a single buffer. For repositories containing very large individual text files, a future implementation using ZIP data descriptors and streaming compression would be more appropriate.

## Limitations

- ZIP64 is not supported yet.
- The central directory is kept in memory until the end of the archive.
- Each non-scrubbed file is loaded and compressed as a single buffer.
- File timestamps are set to the current execution time, not Git commit time.
- Git submodules are not expanded.
- The tool archives tracked files in the specified Git tree only. Untracked working-tree files are not included.

## Example

```sh
git-voidzip \
  --repo . \
  --ref HEAD \
  --prefix my-project/ \
  --output my-project.zip
```

Inspect the result:

```sh
unzip -l my-project.zip
```

Media and binary files should still appear in the ZIP, but their size should be `0`.

## Development

Run the smoke test:

```sh
npm test
```

## License

MIT
