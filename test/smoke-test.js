"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const cli = path.join(root, "bin", "git-voidzip.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "git-voidzip-"));
const repo = path.join(tmp, "repo");
const zip = path.join(tmp, "out.zip");

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  });
}

fs.mkdirSync(repo);
run("git", ["init"], repo);
run("git", ["config", "user.email", "test@example.com"], repo);
run("git", ["config", "user.name", "Test User"], repo);

fs.writeFileSync(path.join(repo, "README.txt"), "hello\n");
fs.writeFileSync(path.join(repo, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
fs.writeFileSync(path.join(repo, "data.bin"), Buffer.from([0x00, 0x01, 0x02, 0x03]));

run("git", ["add", "."], repo);
run("git", ["commit", "-m", "initial"], repo);

run("node", [cli, "--repo", repo, "--output", zip], root);

const listing = run("unzip", ["-l", zip], root);

if (!listing.includes("README.txt")) {
  throw new Error("README.txt was not included in the ZIP archive");
}

if (!/\s+0\s+.*image\.png/.test(listing)) {
  throw new Error("image.png was not scrubbed to a 0-byte file");
}

if (!/\s+0\s+.*data\.bin/.test(listing)) {
  throw new Error("data.bin was not scrubbed to a 0-byte file");
}

console.log("Smoke test passed");
