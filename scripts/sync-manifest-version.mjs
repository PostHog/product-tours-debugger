import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const manifestPath = resolve(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

manifest.version = pkg.version;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// Stage the updated manifest so it's included in the version commit
execSync("git add manifest.json", { cwd: root });
