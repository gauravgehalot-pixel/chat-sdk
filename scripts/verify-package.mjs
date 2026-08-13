import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "opsrabbit-chat-pack-"));
try {
  const output = execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryDirectory], { encoding: "utf8" });
  const [result] = JSON.parse(output);
  if (!result?.filename || !Array.isArray(result.files)) throw new Error("npm pack returned no package inventory.");
  const paths = new Set(result.files.map((file) => file.path));
  for (const required of ["package.json", "README.md", "LICENSE", "NOTICE", "dist/index.js", "dist/index.d.ts", "dist/widget.js", "dist/widget.d.ts", "dist/testing.js", "dist/testing.d.ts"]) {
    if (!paths.has(required)) throw new Error(`Packed package is missing ${required}.`);
  }
  for (const forbidden of ["test/", "coverage/", ".git/", "node_modules/"]) {
    if ([...paths].some((path) => path.startsWith(forbidden))) throw new Error(`Packed package contains forbidden path ${forbidden}.`);
  }
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  if (packageJson.name !== "@opsrabbit/chat" || packageJson.private === true || packageJson.publishConfig?.access !== "public") {
    throw new Error("Package publication metadata is invalid.");
  }
  const source = readFileSync("src/client.ts", "utf8");
  const reportedVersion = source.match(/const SDK_VERSION = "([^"]+)";/)?.[1];
  if (reportedVersion !== packageJson.version) {
    throw new Error(`SDK header version ${reportedVersion ?? "missing"} does not match package version ${packageJson.version}.`);
  }
  const tarball = join(temporaryDirectory, result.filename);
  const consumerDirectory = join(temporaryDirectory, "consumer");
  mkdirSync(consumerDirectory);
  writeFileSync(join(consumerDirectory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", tarball], { cwd: consumerDirectory, stdio: "pipe" });
  writeFileSync(join(consumerDirectory, "index.mjs"), 'import { OpsRabbitChat, ChatError } from "@opsrabbit/chat";\nif (typeof OpsRabbitChat !== "function" || typeof ChatError !== "function") process.exit(1);\n');
  execFileSync(process.execPath, ["index.mjs"], { cwd: consumerDirectory, stdio: "pipe" });
  writeFileSync(join(consumerDirectory, "widget.mjs"), 'import { OpsRabbitChatElement } from "@opsrabbit/chat/widget";\nif (typeof OpsRabbitChatElement !== "function") process.exit(1);\n');
  execFileSync(process.execPath, ["widget.mjs"], { cwd: consumerDirectory, stdio: "pipe" });
  writeFileSync(join(consumerDirectory, "index.mts"), 'import { OpsRabbitChat, type ConversationPage } from "@opsrabbit/chat";\nconst Client: typeof OpsRabbitChat = OpsRabbitChat;\nconst page = null as ConversationPage | null;\nvoid Client; void page;\n');
  execFileSync(join(process.cwd(), "node_modules", ".bin", "tsc"), ["--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "index.mts"], { cwd: consumerDirectory, stdio: "pipe" });
  process.stdout.write(`Verified ${result.filename} with ${result.files.length} files.\n`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
