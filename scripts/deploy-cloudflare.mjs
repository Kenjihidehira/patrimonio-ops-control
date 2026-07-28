import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const revision = readGitRevision(root);
const tag = `git-${revision.slice(0, 12)}`;

runNode(resolve(root, "node_modules/vinext/dist/cli.js"), ["build"]);
runNode(resolve(root, "node_modules/wrangler/bin/wrangler.js"), [
  "deploy",
  "--message",
  `git:${revision}`,
  "--tag",
  tag,
]);

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readGitRevision(repositoryRoot) {
  const dotGitPath = resolve(repositoryRoot, ".git");
  let gitDirectory = dotGitPath;
  if (!statSync(dotGitPath).isDirectory()) {
    const pointer = readFileSync(dotGitPath, "utf8").trim();
    if (!pointer.startsWith("gitdir:")) throw new Error("Arquivo .git inválido.");
    gitDirectory = resolve(repositoryRoot, pointer.slice("gitdir:".length).trim());
  }

  const head = readFileSync(resolve(gitDirectory, "HEAD"), "utf8").trim();
  if (/^[a-f0-9]{40}$/i.test(head)) return head.toLowerCase();
  if (!head.startsWith("ref: ")) throw new Error("HEAD do Git inválido.");

  const reference = head.slice("ref: ".length);
  const looseReference = resolve(gitDirectory, reference);
  if (existsSync(looseReference)) {
    const revision = readFileSync(looseReference, "utf8").trim();
    if (/^[a-f0-9]{40}$/i.test(revision)) return revision.toLowerCase();
  }

  const packedRefsPath = resolve(gitDirectory, "packed-refs");
  if (existsSync(packedRefsPath)) {
    const match = readFileSync(packedRefsPath, "utf8")
      .split(/\r?\n/)
      .find((line) => line.endsWith(` ${reference}`));
    const revision = match?.split(" ")[0] ?? "";
    if (/^[a-f0-9]{40}$/i.test(revision)) return revision.toLowerCase();
  }

  throw new Error(`Não foi possível resolver a revisão Git ${reference}.`);
}
