// ProjoPDF: build .work/translations.txt (embedded by the prebuild) from the
// public apptranslator edit history. Read-only: nothing is sent to the server
// (cmd/trans-dl.ts needs upstream's secret and registers strings there).
//
// Usage: bun cmd/projo-trans.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const kServer = "https://www.apptranslator.org";
const kApp = "SumatraPDF";
const kOutPath = join(".work", "translations.txt");
// t, time, user, lang, english, translation
const kRecordTrans = "t";
const kRecordFields = 6;

// same CSV dialect as cmd/trans-dl.ts
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c !== '"') {
        field += c;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function main() {
  const uri = `${kServer}/api/dltranshist?app=${encodeURIComponent(kApp)}&size=0`;
  const resp = await fetch(uri);
  if (!resp.ok) {
    throw new Error(`dltranshist HTTP ${resp.status}`);
  }
  const text = await resp.text();

  // english -> lang -> translation; the log is oldest first, the last edit wins
  const byString = new Map<string, Map<string, string>>();
  for (const rec of parseCsv(text)) {
    if (rec[0] !== kRecordTrans || rec.length !== kRecordFields) continue;
    const [, , , lang, english, translation] = rec;
    if (english.length === 0 || english.includes("\n")) continue;
    let m = byString.get(english);
    if (!m) {
      m = new Map();
      byString.set(english, m);
    }
    m.set(lang, translation);
  }

  // header: 2 lines skipped by ParseTranslationsTxt()
  const out: string[] = [`AppTranslator: ${kApp}`, "projo"];
  const strings = [...byString.keys()].sort();
  for (const s of strings) {
    out.push(":" + s);
    const m = byString.get(s)!;
    for (const lang of [...m.keys()].sort()) {
      const t = m.get(lang)!.trim();
      if (t.length === 0 || t.includes("\n")) continue;
      out.push(lang + ":" + t);
    }
  }
  mkdirSync(".work", { recursive: true });
  writeFileSync(kOutPath, out.join("\n") + "\n", "utf-8");
  console.log(`wrote ${kOutPath}: ${strings.length} strings`);
}

await main();
