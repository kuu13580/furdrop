import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(root, "workers/wrangler.template.toml");
const outputPath = resolve(root, "workers/wrangler.toml");

const template = readFileSync(templatePath, "utf-8");

const result = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
  const value = process.env[key];
  if (!value) {
    console.error(`Error: environment variable ${key} is not set`);
    process.exit(1);
  }
  return value;
});

writeFileSync(outputPath, result);
console.log("Generated workers/wrangler.toml");
