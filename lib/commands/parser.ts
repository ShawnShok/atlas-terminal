/**
 * Command-bar parsing is deliberately kept independent from routing and UI.
 * Add a keyword to the registry, then map the resulting intent at the edge of
 * the application. This keeps command syntax deterministic and easy to test.
 */

export const TICKER_SYMBOL_PATTERN =
  /^[A-Z][A-Z0-9]{0,4}(?:[.-][A-Z0-9]{1,2})?$/;

const MAX_COMMAND_LENGTH = 256;

export interface CommandKeywordDefinition<Kind extends string = string> {
  readonly keyword: string;
  readonly kind: Kind;
  readonly aliases?: readonly string[];
}

export interface TickerListCommandDefinition<Kind extends string = string>
  extends CommandKeywordDefinition<Kind> {
  readonly minTickers: number;
  readonly maxTickers?: number;
  readonly rejectDuplicates?: boolean;
}

export interface CommandParserRegistry<
  TickerKind extends string = string,
  ExactKind extends string = string,
  TickerListKind extends string = string,
> {
  /** Commands written after a ticker, such as `NVDA NEWS`. */
  readonly tickerCommands: readonly CommandKeywordDefinition<TickerKind>[];
  /** Commands that must be entered alone, such as `MARKET`. */
  readonly exactCommands: readonly CommandKeywordDefinition<ExactKind>[];
  /** Prefix commands followed by a bounded list of tickers. */
  readonly tickerListCommands: readonly TickerListCommandDefinition<TickerListKind>[];
}

export const DEFAULT_COMMAND_REGISTRY = {
  tickerCommands: [
    { keyword: "OVERVIEW", kind: "security" },
    { keyword: "CHART", kind: "chart" },
    { keyword: "NEWS", kind: "news" },
    { keyword: "OPT", kind: "options" },
    { keyword: "FIN", kind: "financials" },
    { keyword: "EVENTS", kind: "events" },
  ],
  exactCommands: [
    { keyword: "MARKET", kind: "market" },
    { keyword: "MOVERS", kind: "movers" },
    { keyword: "NEWS", kind: "news" },
    { keyword: "EVENTS", kind: "events" },
    { keyword: "SCAN", kind: "scanner" },
    { keyword: "WATCH", kind: "watchlist" },
    { keyword: "EARNINGS", kind: "earnings" },
  ],
  tickerListCommands: [
    {
      keyword: "COMPARE",
      kind: "compare",
      minTickers: 2,
      maxTickers: 12,
      rejectDuplicates: true,
    },
  ],
} as const satisfies CommandParserRegistry;

export type TickerCommandKind =
  (typeof DEFAULT_COMMAND_REGISTRY.tickerCommands)[number]["kind"];
export type ExactCommandKind =
  (typeof DEFAULT_COMMAND_REGISTRY.exactCommands)[number]["kind"];
export type TickerListCommandKind =
  (typeof DEFAULT_COMMAND_REGISTRY.tickerListCommands)[number]["kind"];

export type RegistryCommandIntent<
  TickerKind extends string,
  ExactKind extends string,
  TickerListKind extends string,
> =
  | Readonly<{
      kind: "security";
      ticker: string;
      normalizedInput: string;
    }>
  | Readonly<{
      kind: TickerKind;
      ticker: string;
      normalizedInput: string;
    }>
  | Readonly<{
      kind: ExactKind;
      normalizedInput: string;
    }>
  | Readonly<{
      kind: TickerListKind;
      tickers: readonly string[];
      normalizedInput: string;
    }>;

/** Every intent produced by the built-in ATLAS command registry. */
export type CommandIntent = RegistryCommandIntent<
  TickerCommandKind,
  ExactCommandKind,
  TickerListCommandKind
>;

export const SCANNER_COMMAND_PRESETS = [
  { name: "NEWS MOVERS", id: "news-movers" },
  { name: "CATALYST MOMENTUM", id: "catalyst-momentum" },
  { name: "EARNINGS SOON", id: "earnings-soon" },
  { name: "HIGH RELATIVE VOLUME", id: "high-relative-volume" },
  { name: "BREAKOUT WATCH", id: "breakout-watch" },
  { name: "UNUSUAL OPTIONS RESEARCH", id: "unusual-options-research" },
  { name: "WATCHLIST CATALYST FEED", id: "watchlist-catalyst-feed" },
] as const;

export type AtlasCommandIntent = CommandIntent
  | Readonly<{
      kind: "watchlist";
      watchlistName: string;
      normalizedInput: string;
    }>
  | Readonly<{
      kind: "scanner";
      scannerPresetId: (typeof SCANNER_COMMAND_PRESETS)[number]["id"];
      scannerPresetName: (typeof SCANNER_COMMAND_PRESETS)[number]["name"];
      normalizedInput: string;
    }>;

export type CommandParseErrorCode =
  | "INVALID_INPUT"
  | "EMPTY_INPUT"
  | "INPUT_TOO_LONG"
  | "INVALID_TICKER"
  | "MISSING_TICKER"
  | "TOO_FEW_TICKERS"
  | "TOO_MANY_TICKERS"
  | "DUPLICATE_TICKER"
  | "UNKNOWN_COMMAND"
  | "UNEXPECTED_ARGUMENTS";

export interface CommandParseError {
  readonly code: CommandParseErrorCode;
  readonly message: string;
  readonly input: string;
  readonly normalizedInput: string;
  readonly token?: string;
  readonly tokenIndex?: number;
}

export type CommandParseResult<Intent = CommandIntent> =
  | Readonly<{ ok: true; intent: Intent }>
  | Readonly<{ ok: false; error: CommandParseError }>;

export type CommandParser<Intent = CommandIntent> = (
  input: string,
) => CommandParseResult<Intent>;

export type CommandSuggestionKind =
  | "ticker"
  | "company"
  | "command"
  | "page"
  | "watchlist"
  | "saved-screen";

export interface CommandSuggestion {
  readonly id: string;
  readonly label: string;
  readonly kind: CommandSuggestionKind;
  readonly command?: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
}

export type RankedCommandSuggestion<
  Suggestion extends CommandSuggestion = CommandSuggestion,
> = Suggestion &
  Readonly<{
    score: number;
    matchedOn: string;
  }>;

export const DEFAULT_COMMAND_CATALOG: readonly CommandSuggestion[] = [
  {
    id: "command:security",
    label: "Open security overview",
    kind: "command",
    command: "<TICKER>",
    keywords: ["ticker", "symbol", "company", "stock"],
  },
  {
    id: "command:overview",
    label: "Open ticker overview",
    kind: "command",
    command: "<TICKER> OVERVIEW",
    keywords: ["ticker", "summary", "research"],
  },
  {
    id: "command:chart",
    label: "Open ticker chart",
    kind: "command",
    command: "<TICKER> CHART",
    keywords: ["price", "candlestick", "technical"],
  },
  {
    id: "command:news",
    label: "Open ticker news",
    kind: "command",
    command: "<TICKER> NEWS",
    keywords: ["headlines", "benzinga"],
  },
  {
    id: "command:options",
    label: "Open options chain",
    kind: "command",
    command: "<TICKER> OPT",
    keywords: ["calls", "puts", "derivatives"],
  },
  {
    id: "command:financials",
    label: "Open company financials",
    kind: "command",
    command: "<TICKER> FIN",
    keywords: ["income", "balance sheet", "cash flow", "fundamentals"],
  },
  {
    id: "command:events",
    label: "Open corporate events",
    kind: "command",
    command: "<TICKER> EVENTS",
    keywords: ["catalysts", "calendar", "tmx"],
  },
  {
    id: "page:market",
    label: "Market overview",
    kind: "page",
    command: "MARKET",
    keywords: ["indices", "breadth"],
  },
  {
    id: "page:movers",
    label: "Market movers",
    kind: "page",
    command: "MOVERS",
    keywords: ["gainers", "losers", "volume", "gaps"],
  },
  {
    id: "page:scanner",
    label: "Stock scanner",
    kind: "page",
    command: "SCAN",
    keywords: ["screener", "filters"],
  },
  {
    id: "page:news",
    label: "News terminal",
    kind: "page",
    command: "NEWS",
    keywords: ["benzinga", "headlines", "feed"],
  },
  {
    id: "page:events",
    label: "Corporate-event calendar",
    kind: "page",
    command: "EVENTS",
    keywords: ["tmx", "calendar", "catalysts"],
  },
  {
    id: "command:scan-news-movers",
    label: "Run News Movers scanner",
    kind: "saved-screen",
    command: "SCAN NEWS MOVERS",
    keywords: ["scanner", "news", "volume"],
  },
  {
    id: "page:watchlist",
    label: "Watchlist",
    kind: "page",
    command: "WATCH CORE",
    keywords: ["favorites", "saved tickers"],
  },
  {
    id: "page:earnings",
    label: "Earnings center",
    kind: "page",
    command: "EARNINGS",
    keywords: ["calendar", "estimates", "reports"],
  },
  {
    id: "command:compare",
    label: "Compare securities",
    kind: "command",
    command: "COMPARE <TICKER> <TICKER>",
    keywords: ["relative performance", "returns"],
  },
] as const;

type BroadKeywordDefinition = CommandKeywordDefinition<string>;

type PrefixDefinition<
  ExactKind extends string = string,
  TickerListKind extends string = string,
> =
  | Readonly<{
      syntax: "exact";
      definition: CommandKeywordDefinition<ExactKind>;
    }>
  | Readonly<{
      syntax: "ticker-list";
      definition: TickerListCommandDefinition<TickerListKind>;
    }>;

/** Collapse whitespace and use the command language's canonical uppercase. */
export function normalizeCommandInput(input: string): string {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Validate a normalized or user-entered U.S. equity ticker symbol. */
export function isTickerSymbol(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!/^[A-Za-z0-9.-]+$/.test(trimmed)) {
    return false;
  }

  const normalized = trimmed.toUpperCase();
  return !/\s/.test(normalized) && TICKER_SYMBOL_PATTERN.test(normalized);
}

function registryKeyword(keyword: string): string {
  const normalized = normalizeCommandInput(keyword);

  if (!normalized || normalized.includes(" ")) {
    throw new TypeError(
      `Command registry keywords must contain exactly one token: ${JSON.stringify(keyword)}`,
    );
  }

  return normalized;
}

function definitionKeywords(
  definition: BroadKeywordDefinition,
): readonly string[] {
  return [definition.keyword, ...(definition.aliases ?? [])];
}

function addUniqueDefinition<Value>(
  lookup: Map<string, Value>,
  keyword: string,
  value: Value,
  syntax: string,
): void {
  const existing = lookup.get(keyword);
  if (existing !== undefined && existing !== value) {
    throw new TypeError(
      `Ambiguous ${syntax} command keyword in registry: ${keyword}`,
    );
  }
  lookup.set(keyword, value);
}

function validateDefinition(definition: BroadKeywordDefinition): void {
  if (!definition.kind.trim()) {
    throw new TypeError("Command registry intent kinds cannot be empty.");
  }

  for (const keyword of definitionKeywords(definition)) {
    registryKeyword(keyword);
  }
}

function failure(
  code: CommandParseErrorCode,
  message: string,
  input: string,
  normalizedInput: string,
  details: Pick<CommandParseError, "token" | "tokenIndex"> = {},
): CommandParseResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      input,
      normalizedInput,
      ...details,
    },
  };
}

/**
 * Build a parser from declarative syntax groups. Keyword collisions are
 * rejected at construction time so a registry change cannot silently make a
 * command ambiguous.
 */
export function createCommandParser<
  TickerKind extends string,
  ExactKind extends string,
  TickerListKind extends string,
>(
  registry: CommandParserRegistry<TickerKind, ExactKind, TickerListKind>,
): CommandParser<
  RegistryCommandIntent<TickerKind, ExactKind, TickerListKind>
> {
  const tickerLookup = new Map<
    string,
    CommandKeywordDefinition<TickerKind>
  >();
  const prefixLookup = new Map<
    string,
    PrefixDefinition<ExactKind, TickerListKind>
  >();
  const reservedKeywords = new Set<string>();

  for (const definition of registry.tickerCommands) {
    validateDefinition(definition);
    for (const rawKeyword of definitionKeywords(definition)) {
      const keyword = registryKeyword(rawKeyword);
      addUniqueDefinition(tickerLookup, keyword, definition, "ticker suffix");
      reservedKeywords.add(keyword);
    }
  }

  for (const definition of registry.exactCommands) {
    validateDefinition(definition);
    const prefix: PrefixDefinition<ExactKind, TickerListKind> = {
      syntax: "exact",
      definition,
    };
    for (const rawKeyword of definitionKeywords(definition)) {
      const keyword = registryKeyword(rawKeyword);
      addUniqueDefinition(prefixLookup, keyword, prefix, "prefix");
      reservedKeywords.add(keyword);
    }
  }

  for (const definition of registry.tickerListCommands) {
    validateDefinition(definition);
    if (!Number.isInteger(definition.minTickers) || definition.minTickers < 1) {
      throw new TypeError("minTickers must be a positive integer.");
    }
    if (
      definition.maxTickers !== undefined &&
      (!Number.isInteger(definition.maxTickers) ||
        definition.maxTickers < definition.minTickers)
    ) {
      throw new TypeError("maxTickers must be an integer at least minTickers.");
    }

    const prefix: PrefixDefinition<ExactKind, TickerListKind> = {
      syntax: "ticker-list",
      definition,
    };
    for (const rawKeyword of definitionKeywords(definition)) {
      const keyword = registryKeyword(rawKeyword);
      addUniqueDefinition(prefixLookup, keyword, prefix, "prefix");
      reservedKeywords.add(keyword);
    }
  }

  type Intent = RegistryCommandIntent<TickerKind, ExactKind, TickerListKind>;

  return (input: string): CommandParseResult<Intent> => {
    if (typeof input !== "string") {
      return failure(
        "INVALID_INPUT",
        "Command input must be a string.",
        "",
        "",
      );
    }

    if (/[^\x00-\x7F]/.test(input)) {
      return failure(
        "INVALID_INPUT",
        "Commands may only contain ASCII ticker and command characters.",
        input,
        "",
      );
    }

    const normalizedInput = normalizeCommandInput(input);
    if (!normalizedInput) {
      return failure(
        "EMPTY_INPUT",
        "Enter a ticker or command.",
        input,
        normalizedInput,
      );
    }

    if (normalizedInput.length > MAX_COMMAND_LENGTH) {
      return failure(
        "INPUT_TOO_LONG",
        `Commands cannot exceed ${MAX_COMMAND_LENGTH} characters.`,
        input,
        normalizedInput,
      );
    }

    const tokens = normalizedInput.split(" ");
    const prefix = prefixLookup.get(tokens[0]);

    if (prefix?.syntax === "exact") {
      if (tokens.length !== 1) {
        return failure(
          "UNEXPECTED_ARGUMENTS",
          `${tokens[0]} does not accept arguments.`,
          input,
          normalizedInput,
          { token: tokens[1], tokenIndex: 1 },
        );
      }

      return {
        ok: true,
        intent: {
          kind: prefix.definition.kind,
          normalizedInput,
        },
      };
    }

    if (prefix?.syntax === "ticker-list") {
      const definition = prefix.definition;
      const tickers = tokens.slice(1);

      if (tickers.length < definition.minTickers) {
        return failure(
          "TOO_FEW_TICKERS",
          `${tokens[0]} requires at least ${definition.minTickers} tickers.`,
          input,
          normalizedInput,
        );
      }

      if (
        definition.maxTickers !== undefined &&
        tickers.length > definition.maxTickers
      ) {
        return failure(
          "TOO_MANY_TICKERS",
          `${tokens[0]} accepts at most ${definition.maxTickers} tickers.`,
          input,
          normalizedInput,
          {
            token: tickers[definition.maxTickers],
            tokenIndex: definition.maxTickers + 1,
          },
        );
      }

      const seenTickers = new Set<string>();
      for (
        let tickerIndex = 0;
        tickerIndex < tickers.length;
        tickerIndex += 1
      ) {
        const ticker = tickers[tickerIndex];
        if (!isTickerSymbol(ticker) || reservedKeywords.has(ticker)) {
          return failure(
            "INVALID_TICKER",
            `${ticker} is not a valid ticker symbol.`,
            input,
            normalizedInput,
            { token: ticker, tokenIndex: tickerIndex + 1 },
          );
        }

        if (definition.rejectDuplicates && seenTickers.has(ticker)) {
          return failure(
            "DUPLICATE_TICKER",
            `${ticker} can only appear once in ${tokens[0]}.`,
            input,
            normalizedInput,
            { token: ticker, tokenIndex: tickerIndex + 1 },
          );
        }
        seenTickers.add(ticker);
      }

      return {
        ok: true,
        intent: {
          kind: definition.kind,
          tickers,
          normalizedInput,
        },
      };
    }

    const firstToken = tokens[0];
    const leadingTickerCommand = tickerLookup.get(firstToken);

    if (leadingTickerCommand) {
      return failure(
        "MISSING_TICKER",
        `${firstToken} must follow a ticker symbol.`,
        input,
        normalizedInput,
        { token: firstToken, tokenIndex: 0 },
      );
    }

    if (!isTickerSymbol(firstToken) || reservedKeywords.has(firstToken)) {
      return failure(
        "INVALID_TICKER",
        `${firstToken} is not a valid ticker symbol.`,
        input,
        normalizedInput,
        { token: firstToken, tokenIndex: 0 },
      );
    }

    if (tokens.length === 1) {
      return {
        ok: true,
        intent: {
          kind: "security",
          ticker: firstToken,
          normalizedInput,
        },
      };
    }

    const tickerCommand = tickerLookup.get(tokens[1]);
    if (!tickerCommand) {
      return failure(
        "UNKNOWN_COMMAND",
        `${tokens[1]} is not a recognized ticker command.`,
        input,
        normalizedInput,
        { token: tokens[1], tokenIndex: 1 },
      );
    }

    if (tokens.length !== 2) {
      return failure(
        "UNEXPECTED_ARGUMENTS",
        `${tokens[1]} does not accept additional arguments.`,
        input,
        normalizedInput,
        { token: tokens[2], tokenIndex: 2 },
      );
    }

    return {
      ok: true,
      intent: {
        kind: tickerCommand.kind,
        ticker: firstToken,
        normalizedInput,
      },
    };
  };
}

const defaultParser = createCommandParser(DEFAULT_COMMAND_REGISTRY);

/** Parse the complete input. Partial or malformed commands never succeed. */
export function parseCommand(input: string): CommandParseResult {
  return defaultParser(input);
}

/** Convenience for callers that only need a valid intent or `null`. */
export function parseCommandIntent(input: string): CommandIntent | null {
  const result = parseCommand(input);
  return result.ok ? result.intent : null;
}

/**
 * Parse ATLAS' user-facing command language, including named watchlists and
 * bounded scanner presets. The core parser stays generic while this wrapper
 * handles the two deliberately multi-word command families.
 */
export function parseAtlasCommand(input: string): CommandParseResult<AtlasCommandIntent> {
  const normalizedInput = normalizeCommandInput(input);

  if (normalizedInput.startsWith("WATCH ")) {
    const watchlistName = normalizedInput.slice("WATCH ".length);
    if (!/^[A-Z0-9][A-Z0-9 &_'-]{0,39}$/.test(watchlistName)) {
      return failure(
        "INVALID_INPUT",
        "Watchlist names may use letters, numbers, spaces, &, apostrophes, underscores, and hyphens.",
        input,
        normalizedInput,
      );
    }
    return {
      ok: true,
      intent: { kind: "watchlist", watchlistName, normalizedInput },
    };
  }

  if (normalizedInput.startsWith("SCAN ")) {
    const requestedName = normalizedInput.slice("SCAN ".length);
    const preset = SCANNER_COMMAND_PRESETS.find(({ name }) => name === requestedName);
    if (!preset) {
      return failure(
        "UNKNOWN_COMMAND",
        `Unknown scanner preset: ${requestedName}.`,
        input,
        normalizedInput,
        { token: requestedName, tokenIndex: 1 },
      );
    }
    return {
      ok: true,
      intent: {
        kind: "scanner",
        scannerPresetId: preset.id,
        scannerPresetName: preset.name,
        normalizedInput,
      },
    };
  }

  return parseCommand(input);
}

function fuzzyScore(query: string, candidate: string): number {
  if (query === candidate) {
    return 1_000;
  }

  if (candidate.startsWith(query)) {
    return 920 - Math.min(candidate.length - query.length, 80);
  }

  const words = candidate.split(/[^A-Z0-9]+/).filter(Boolean);
  const exactWordIndex = words.indexOf(query);
  if (exactWordIndex >= 0) {
    return 880 - exactWordIndex * 3;
  }

  const prefixWordIndex = words.findIndex((word) => word.startsWith(query));
  if (prefixWordIndex >= 0) {
    return 820 - prefixWordIndex * 3;
  }

  const substringIndex = candidate.indexOf(query);
  if (substringIndex >= 0) {
    return (
      740 -
      Math.min(substringIndex * 4, 120) -
      Math.min(candidate.length - query.length, 80)
    );
  }

  const initials = words.map((word) => word[0]).join("");
  if (initials.startsWith(query)) {
    return 680 - Math.min(initials.length - query.length, 40);
  }

  let queryIndex = 0;
  let firstMatch = -1;
  let previousMatch = -1;
  let totalGap = 0;

  for (
    let candidateIndex = 0;
    candidateIndex < candidate.length && queryIndex < query.length;
    candidateIndex += 1
  ) {
    if (candidate[candidateIndex] !== query[queryIndex]) {
      continue;
    }

    if (firstMatch < 0) {
      firstMatch = candidateIndex;
    }
    if (previousMatch >= 0) {
      totalGap += candidateIndex - previousMatch - 1;
    }
    previousMatch = candidateIndex;
    queryIndex += 1;
  }

  if (queryIndex !== query.length) {
    return Number.NEGATIVE_INFINITY;
  }

  return (
    580 -
    Math.min(firstMatch * 4, 100) -
    Math.min(totalGap * 8, 220) -
    Math.min(candidate.length - query.length, 80)
  );
}

export function rankCommandSuggestions(
  query: string,
): RankedCommandSuggestion[];
export function rankCommandSuggestions<Suggestion extends CommandSuggestion>(
  query: string,
  catalog: readonly Suggestion[],
): RankedCommandSuggestion<Suggestion>[];
/**
 * Deterministically rank a command catalog using exact, prefix, word,
 * substring, acronym, and subsequence matches. No-match entries are omitted.
 */
export function rankCommandSuggestions<Suggestion extends CommandSuggestion>(
  query: string,
  catalog: readonly Suggestion[] = DEFAULT_COMMAND_CATALOG as readonly Suggestion[],
): RankedCommandSuggestion<Suggestion>[] {
  const normalizedQuery = normalizeCommandInput(query);

  return catalog
    .map((suggestion, originalIndex) => {
      const candidates = [
        suggestion.label,
        suggestion.command,
        ...(suggestion.keywords ?? []),
      ].filter((candidate): candidate is string => Boolean(candidate));

      if (!normalizedQuery) {
        return {
          suggestion,
          originalIndex,
          score: 0,
          matchedOn: suggestion.label,
        };
      }

      let bestScore = Number.NEGATIVE_INFINITY;
      let matchedOn = suggestion.label;

      for (
        let candidateIndex = 0;
        candidateIndex < candidates.length;
        candidateIndex += 1
      ) {
        const candidate = candidates[candidateIndex];
        const normalizedCandidate = normalizeCommandInput(candidate);
        const score =
          fuzzyScore(normalizedQuery, normalizedCandidate) - candidateIndex * 2;
        if (score > bestScore) {
          bestScore = score;
          matchedOn = candidate;
        }
      }

      return {
        suggestion,
        originalIndex,
        score: bestScore,
        matchedOn,
      };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (left, right) =>
        right.score - left.score || left.originalIndex - right.originalIndex,
    )
    .map(({ suggestion, score, matchedOn }) => ({
      ...suggestion,
      score,
      matchedOn,
    }));
}
