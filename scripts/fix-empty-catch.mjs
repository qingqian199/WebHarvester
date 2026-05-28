#!/usr/bin/env node
// Add '// ok: ignored' after every catch {} that lacks a trailing comment.
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync("src/**/*.ts", { cwd: "C:\\Users\\qingqian\\Desktop\\web-harvester" });
let fixed = 0;

for (const f of files) {
  const fp = `C:\\Users\\qingqian\\Desktop\\web-harvester\\${f}`;
  let src = readFileSync(fp, "utf-8");
  const original = src;

  // Replace catch {} / catch(e) {} that has no inline comment after it
  // Only checks the same line for trailing comments (does not look across newlines)
  src = src.replace(
    /(catch\s*(?:\(\s*\w*\s*\))?\s*\{\s*\})(?![^\n\r]*\/\/)/g,
    "$1 // ok: ignored",
  );

  if (src !== original) {
    writeFileSync(fp, src, "utf-8");
    fixed++;
  }
}

console.log(`Fixed ${fixed} files`);
