import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/@mediapipe/tasks-vision/wasm");
const target = resolve(root, "public/mediapipe/wasm");

await mkdir(target, { recursive: true });
for (const file of await readdir(source)) {
  await copyFile(resolve(source, file), resolve(target, file));
}