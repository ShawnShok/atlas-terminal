import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../components/terminal/PersonalResearchPanel.tsx", import.meta.url), "utf8");

test("ticker notes use a bounded debounced and serialized PostgreSQL autosave", () => {
  assert.match(source, /const NOTE_AUTOSAVE_DELAY_MS = 900/);
  assert.match(source, /window\.setTimeout\(enqueueSave, NOTE_AUTOSAVE_DELAY_MS\)/);
  assert.match(source, /saveQueueRef\.current = saveQueueRef\.current\.catch\(\(\) => undefined\)\.then/);
  assert.match(source, /method: noteId \? "PATCH" : "POST"/);
  assert.match(source, /personalRequest<NoteRecord>\("notes"/);
  assert.match(source, /SAVING TO POSTGRESQL/);
  assert.match(source, /SAVED TO POSTGRESQL/);
  assert.match(source, /AUTOSAVE FAILED/);
});

test("notes expose Eastern last-edited timestamps and retain manual controls", () => {
  assert.match(source, /import \{ formatDateTime \} from "@\/lib\/research\/format"/);
  assert.match(source, /LAST EDITED <time dateTime=\{lastEditedAt\}>\{formatDateTime\(lastEditedAt\)\}<\/time>/);
  assert.match(source, />SAVE NOW<\/button>/);
  assert.match(source, />DELETE<\/button>/);
  assert.match(source, />NEW<\/button>/);
});

test("Markdown preview is local, semantic, and never injects raw HTML", () => {
  assert.match(source, /function markdownPreview\(markdown: string\)/);
  assert.match(source, /<pre key=.*<code/);
  assert.match(source, /<blockquote key=/);
  assert.match(source, /<ul key=/);
  assert.match(source, /Raw HTML is displayed as text and is never executed/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /marked|remark|markdown-it|showdown/i);
});

test("notes remain isolated from external market-data APIs", () => {
  assert.match(source, /Notes autosave only to the configured PostgreSQL database/);
  assert.match(source, /Note content is never sent to market-data providers/);
  const notesSection = source.slice(source.indexOf("function NotesWorkspace"), source.indexOf("function AlertsWorkspace"));
  assert.doesNotMatch(notesSection, /MASSIVE_API_KEY|api\.massive\.com|benzinga|tmx/i);
});
