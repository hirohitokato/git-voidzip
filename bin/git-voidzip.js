#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");

const MEDIA_EXTENSIONS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif",
  ".ico", ".icns", ".avif", ".heic", ".heif", ".psd", ".ai", ".eps",

  // Audio
  ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".oga", ".opus",
  ".wma", ".aiff", ".aif", ".mid", ".midi",

  // Video
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".mpeg", ".mpg", ".m4v",
  ".wmv", ".flv", ".3gp", ".ts", ".m2ts",

  // Fonts
  ".ttf", ".otf", ".woff", ".woff2", ".eot",

  // Archives and package-like binary payloads
  ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar",
  ".jar", ".war", ".ear",

  // Documents that are usually binary containers
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",

  // Other common binary artifacts
  ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".wasm",
]);

function parseArgs(argv) {
  const args = {
    repo: ".",
    ref: "HEAD",
    output: null,
    prefix: "",
    mode: "both",
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--repo") args.repo = requireValue(argv, ++i, "--repo");
    else if (a === "--ref") args.ref = requireValue(argv, ++i, "--ref");
    else if (a === "--output" || a === "-o") args.output = requireValue(argv, ++i, "--output");
    else if (a === "--prefix") args.prefix = normalizePrefix(requireValue(argv, ++i, "--prefix"));
    else if (a === "--mode") {
      args.mode = requireValue(argv, ++i, "--mode");
      if (!["media", "binary", "both"].includes(args.mode)) {
        throw new Error("--mode must be one of: media, binary, both");
      }
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (!args.output) {
    throw new Error("Missing required option: --output <file.zip>");
  }

  return args;
}

function requireValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function normalizePrefix(prefix) {
  if (!prefix) return "";
  const p = prefix.replaceAll("\\", "/").replace(/^\/+/, "");
  return p.endsWith("/") ? p : `${p}/`;
}

function printHelp() {
  console.log(`
Usage:
  git-voidzip --output source.zip
  git-voidzip --repo . --ref HEAD --prefix project/ --output source.zip

Options:
  --repo <path>       Git repository path. Default: .
  --ref <ref>         Git ref, branch, tag, or commit. Default: HEAD
  -o, --output <zip>  Output zip file path. Required.
  --prefix <path/>    Prefix directory inside zip, similar to git archive --prefix.
  --mode <mode>       media | binary | both. Default: both

Modes:
  media   Replace known image/audio/video/font/archive/document extensions with empty files.
  binary  Replace files whose content appears binary with empty files.
  both    Apply both rules.
`);
}

function git(repo, args, options = {}) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: options.encoding ?? "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 1024,
  });
}

function listTree(repo, ref) {
  const output = git(repo, ["ls-tree", "-rz", "--full-tree", ref]);
  const records = [];

  for (const chunk of splitNul(output)) {
    if (chunk.length === 0) continue;

    const tab = chunk.indexOf(0x09);
    if (tab < 0) continue;

    const meta = chunk.subarray(0, tab).toString("utf8");
    const filePath = chunk.subarray(tab + 1).toString("utf8");

    const [mode, type, object] = meta.split(" ");
    if (type !== "blob") continue;

    records.push({ mode, object, path: filePath });
  }

  return records;
}

function splitNul(buffer) {
  const parts = [];
  let start = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) {
      parts.push(buffer.subarray(start, i));
      start = i + 1;
    }
  }

  if (start < buffer.length) {
    parts.push(buffer.subarray(start));
  }

  return parts;
}

function readBlob(repo, object) {
  return git(repo, ["cat-file", "-p", object]);
}

function isMediaPath(filePath) {
  return MEDIA_EXTENSIONS.has(path.posix.extname(filePath.toLowerCase()));
}

function appearsBinary(buffer) {
  const limit = Math.min(buffer.length, 8192);

  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) return true;
  }

  return false;
}

function shouldScrubByPath(filePath, mode) {
  return (mode === "media" || mode === "both") && isMediaPath(filePath);
}

function shouldScrubByContent(buffer, mode) {
  return (mode === "binary" || mode === "both") && appearsBinary(buffer);
}

function unixModeFromGitMode(gitMode) {
  if (gitMode === "100755") return 0o100755;
  if (gitMode === "120000") return 0o120777;
  return 0o100644;
}

function normalizeZipPath(filePath) {
  return filePath
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);

  return {
    dosTime:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),

    dosDate:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;

    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }

    table[i] = c >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(value & 0xffff, 0);
  return b;
}

function u32(value) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

async function writeBuffer(stream, buffer) {
  if (buffer.length === 0) return;

  if (!stream.write(buffer)) {
    await once(stream, "drain");
  }
}

async function finishStream(stream) {
  stream.end();
  await once(stream, "finish");
}

async function writeZipEntry(stream, entry, offset, dosTimeDate) {
  const nameBuffer = Buffer.from(entry.name, "utf8");
  const input = entry.data;

  const method = input.length === 0 ? 0 : 8;
  const compressed = method === 0 ? input : zlib.deflateRawSync(input);
  const crc = crc32(input);

  const localHeader = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0x0800),
    u16(method),
    u16(dosTimeDate.dosTime),
    u16(dosTimeDate.dosDate),
    u32(crc),
    u32(compressed.length),
    u32(input.length),
    u16(nameBuffer.length),
    u16(0),
    nameBuffer,
  ]);

  await writeBuffer(stream, localHeader);
  await writeBuffer(stream, compressed);

  return {
    centralDirectoryRecord: {
      nameBuffer,
      method,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: input.length,
      offset,
      unixMode: entry.unixMode,
      dosTime: dosTimeDate.dosTime,
      dosDate: dosTimeDate.dosDate,
    },
    bytesWritten: localHeader.length + compressed.length,
  };
}

async function writeCentralDirectory(stream, records, centralStart) {
  let offset = centralStart;

  for (const record of records) {
    const externalAttrs = (record.unixMode << 16) >>> 0;

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(0x031e),
      u16(20),
      u16(0x0800),
      u16(record.method),
      u16(record.dosTime),
      u16(record.dosDate),
      u32(record.crc),
      u32(record.compressedSize),
      u32(record.uncompressedSize),
      u16(record.nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(externalAttrs),
      u32(record.offset),
      record.nameBuffer,
    ]);

    await writeBuffer(stream, centralHeader);
    offset += centralHeader.length;
  }

  return offset - centralStart;
}

async function writeEndOfCentralDirectory(stream, recordCount, centralSize, centralStart) {
  if (recordCount > 0xffff) {
    throw new Error("ZIP64 is not supported yet: too many files for classic ZIP format");
  }

  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(recordCount),
    u16(recordCount),
    u32(centralSize),
    u32(centralStart),
    u16(0),
  ]);

  await writeBuffer(stream, eocd);
}

async function createZipFromGitStreamed(args) {
  const repo = path.resolve(args.repo);
  const files = listTree(repo, args.ref);

  const output = fs.createWriteStream(args.output);
  const centralDirectoryRecords = [];
  const dosTimeDate = dosDateTime();

  let offset = 0;
  let scrubbed = 0;

  try {
    for (const file of files) {
      const relativePath = normalizeZipPath(file.path);
      const zipPath = args.prefix + relativePath;

      let data;
      let scrub = shouldScrubByPath(relativePath, args.mode);

      if (scrub) {
        data = Buffer.alloc(0);
      } else {
        const blob = readBlob(repo, file.object);

        if (shouldScrubByContent(blob, args.mode)) {
          data = Buffer.alloc(0);
          scrub = true;
        } else {
          data = blob;
        }
      }

      if (scrub) scrubbed++;

      const { centralDirectoryRecord, bytesWritten } = await writeZipEntry(
        output,
        {
          name: zipPath,
          data,
          unixMode: unixModeFromGitMode(file.mode),
        },
        offset,
        dosTimeDate,
      );

      centralDirectoryRecords.push(centralDirectoryRecord);
      offset += bytesWritten;
    }

    const centralStart = offset;

    const centralSize = await writeCentralDirectory(
      output,
      centralDirectoryRecords,
      centralStart,
    );

    await writeEndOfCentralDirectory(
      output,
      centralDirectoryRecords.length,
      centralSize,
      centralStart,
    );

    await finishStream(output);

    return {
      fileCount: files.length,
      scrubbed,
    };
  } catch (error) {
    output.destroy();
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await createZipFromGitStreamed(args);

  console.error(`Created: ${args.output}`);
  console.error(`Files: ${result.fileCount}`);
  console.error(`Scrubbed to empty files: ${result.scrubbed}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
