import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// The application consumes the TypeScript source directly. Tests transpile the
// single dependency-free module in memory so they still run with plain
// `node --test` and do not require tsx, ts-node, or generated JavaScript.
const parserSource = await readFile(
  new URL("../lib/commands/parser.ts", import.meta.url),
  "utf8",
);
const transpiled = ts.transpileModule(parserSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "parser.ts",
  reportDiagnostics: true,
});

const syntaxErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(
  syntaxErrors,
  [],
  `parser.ts has transpilation errors: ${syntaxErrors
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
    .join("\n")}`,
);

const parser = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);

const {
  DEFAULT_COMMAND_CATALOG,
  createCommandParser,
  isTickerSymbol,
  normalizeCommandInput,
  parseAtlasCommand,
  parseCommand,
  parseCommandIntent,
  rankCommandSuggestions,
} = parser;

function expectIntent(input, expectedIntent) {
  const result = parseCommand(input);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  assert.deepEqual(result.intent, expectedIntent);
}

function expectError(input, code) {
  const result = parseCommand(input);
  assert.equal(result.ok, false, `Expected ${JSON.stringify(input)} to fail.`);
  assert.equal(result.error.code, code);
  return result.error;
}

test("normalizes case and whitespace for lone tickers", () => {
  expectIntent(" \t nvda\n", {
    kind: "security",
    ticker: "NVDA",
    normalizedInput: "NVDA",
  });
  expectIntent("brk.b", {
    kind: "security",
    ticker: "BRK.B",
    normalizedInput: "BRK.B",
  });
});

test("parses every supported ticker command", () => {
  const cases = [
    ["TSLA CHART", "chart"],
    ["NVDA NEWS", "news"],
    ["AMD OPT", "options"],
    ["META FIN", "financials"],
    ["PLTR EVENTS", "events"],
    ["NVDA OVERVIEW", "security"],
  ];

  for (const [input, kind] of cases) {
    const ticker = input.split(" ")[0];
    expectIntent(input.toLowerCase(), {
      kind,
      ticker,
      normalizedInput: input,
    });
  }
});

test("parses every supported exact page command", () => {
  const cases = [
    ["MARKET", "market"],
    ["MOVERS", "movers"],
    ["NEWS", "news"],
    ["EVENTS", "events"],
    ["SCAN", "scanner"],
    ["WATCH", "watchlist"],
    ["EARNINGS", "earnings"],
  ];

  for (const [input, kind] of cases) {
    expectIntent(`  ${input.toLowerCase()}  `, {
      kind,
      normalizedInput: input,
    });
  }
});

test("parses a bounded, normalized COMPARE ticker list", () => {
  expectIntent(" compare   nvda amd\tavgo ", {
    kind: "compare",
    tickers: ["NVDA", "AMD", "AVGO"],
    normalizedInput: "COMPARE NVDA AMD AVGO",
  });
});

test("rejects partial commands and extra arguments", () => {
  expectError("CHART", "MISSING_TICKER");
  expectError("NEWS NVDA", "UNEXPECTED_ARGUMENTS");
  expectError("MARKET AAPL", "UNEXPECTED_ARGUMENTS");
  expectError("AAPL NEWS NOW", "UNEXPECTED_ARGUMENTS");
  expectError("AAPL QUOTE", "UNKNOWN_COMMAND");
});

test("parses named watchlists and bounded scanner presets", () => {
  assert.deepEqual(parseAtlasCommand(" watch core "), {
    ok: true,
    intent: {
      kind: "watchlist",
      watchlistName: "CORE",
      normalizedInput: "WATCH CORE",
    },
  });
  assert.deepEqual(parseAtlasCommand("scan news movers"), {
    ok: true,
    intent: {
      kind: "scanner",
      scannerPresetId: "news-movers",
      scannerPresetName: "NEWS MOVERS",
      normalizedInput: "SCAN NEWS MOVERS",
    },
  });
  assert.equal(parseAtlasCommand("SCAN GUARANTEED RETURNS").ok, false);
  assert.equal(parseAtlasCommand("WATCH <SCRIPT>").ok, false);
});

test("rejects malformed ticker syntax and reserved words as tickers", () => {
  assert.equal(expectError("AAPL!", "INVALID_TICKER").token, "AAPL!");
  assert.equal(
    expectError("COMPARE AAPL WATCH", "INVALID_TICKER").tokenIndex,
    2,
  );
  expectError("TOOLONG", "INVALID_TICKER");
  expectError("COMPARE AAPL BRK/B", "INVALID_TICKER");
});

test("rejects malformed COMPARE cardinality and duplicates", () => {
  expectError("COMPARE", "TOO_FEW_TICKERS");
  expectError("COMPARE NVDA", "TOO_FEW_TICKERS");
  expectError("COMPARE NVDA nvda", "DUPLICATE_TICKER");

  const thirteenTickers = Array.from(
    { length: 13 },
    (_, index) => `A${index.toString().padStart(2, "0")}`,
  );
  expectError(`COMPARE ${thirteenTickers.join(" ")}`, "TOO_MANY_TICKERS");
});

test("returns structured empty and oversized-input errors", () => {
  const emptyError = expectError(" \n\t ", "EMPTY_INPUT");
  assert.equal(emptyError.normalizedInput, "");
  expectError("A".repeat(257), "INPUT_TOO_LONG");
});

test("exposes normalization, ticker validation, and nullable convenience helpers", () => {
  assert.equal(normalizeCommandInput("  nvda\t news "), "NVDA NEWS");
  assert.equal(isTickerSymbol(" brk.b "), true);
  assert.equal(isTickerSymbol("BRK/B"), false);
  assert.equal(isTickerSymbol("ß"), false);
  expectError("ß", "INVALID_INPUT");
  assert.deepEqual(parseCommandIntent("amd opt"), {
    kind: "options",
    ticker: "AMD",
    normalizedInput: "AMD OPT",
  });
  assert.equal(parseCommandIntent("AMD OPT EXTRA"), null);
});

test("supports additional declarative command grammars", () => {
  const customParser = createCommandParser({
    tickerCommands: [
      { keyword: "PROFILE", aliases: ["PRO"], kind: "profile" },
    ],
    exactCommands: [{ keyword: "DASH", kind: "dashboard" }],
    tickerListCommands: [
      {
        keyword: "PAIR",
        kind: "pair",
        minTickers: 2,
        maxTickers: 2,
        rejectDuplicates: true,
      },
    ],
  });

  assert.deepEqual(customParser("aapl pro"), {
    ok: true,
    intent: {
      kind: "profile",
      ticker: "AAPL",
      normalizedInput: "AAPL PRO",
    },
  });
  assert.equal(customParser("DASH").intent.kind, "dashboard");
  assert.deepEqual(customParser("PAIR NVDA AMD").intent.tickers, ["NVDA", "AMD"]);
  assert.equal(customParser("PAIR NVDA AMD AVGO").error.code, "TOO_MANY_TICKERS");
});

test("rejects ambiguous or invalid registry definitions at construction", () => {
  assert.throws(
    () =>
      createCommandParser({
        tickerCommands: [],
        exactCommands: [
          { keyword: "HOME", kind: "home" },
          { keyword: "START", aliases: ["home"], kind: "start" },
        ],
        tickerListCommands: [],
      }),
    /Ambiguous prefix command keyword.*HOME/,
  );

  assert.throws(
    () =>
      createCommandParser({
        tickerCommands: [{ keyword: "BAD COMMAND", kind: "bad" }],
        exactCommands: [],
        tickerListCommands: [],
      }),
    /exactly one token/,
  );
});

test("fuzzy ranking favors exact commands, then useful partial matches", () => {
  const catalog = [
    {
      id: "ticker:nvda",
      label: "NVDA",
      kind: "ticker",
      command: "NVDA",
      keywords: ["NVIDIA Corporation"],
    },
    {
      id: "page:market",
      label: "Market overview",
      kind: "page",
      command: "MARKET",
    },
    {
      id: "page:movers",
      label: "Market movers",
      kind: "page",
      command: "MOVERS",
    },
  ];

  assert.equal(rankCommandSuggestions("market", catalog)[0].id, "page:market");
  assert.equal(rankCommandSuggestions("nvidia", catalog)[0].id, "ticker:nvda");
  assert.equal(rankCommandSuggestions("mvr", catalog)[0].id, "page:movers");
  assert.deepEqual(
    rankCommandSuggestions("", catalog).map(({ id }) => id),
    catalog.map(({ id }) => id),
  );
  assert.deepEqual(rankCommandSuggestions("ZZZZZZ", catalog), []);
});

test("fuzzy ranking is stable and does not mutate its catalog", () => {
  const catalog = [
    { id: "first", label: "ABCD", kind: "command" },
    { id: "second", label: "ABCE", kind: "command" },
  ];
  const snapshot = structuredClone(catalog);

  assert.deepEqual(
    rankCommandSuggestions("ABC", catalog).map(({ id }) => id),
    ["first", "second"],
  );
  assert.deepEqual(catalog, snapshot);
  assert.equal(rankCommandSuggestions("scan")[0].id, "page:scanner");
  assert.ok(DEFAULT_COMMAND_CATALOG.length >= 12);
});
