import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [modelSource, liveNewsSource, terminalSource, personalRouteSource] = await Promise.all([
  readFile(new URL("../lib/research/model.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/terminal/LiveNewsPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/research/NewsTerminal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/personal/route.ts", import.meta.url), "utf8"),
]);

const transpiled = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "model.ts",
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(syntaxErrors, []);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);

function article(overrides = {}) {
  return {
    id: "article-1",
    title: "NVIDIA publishes guidance update",
    summary: "Management updated quarterly guidance.",
    body: null,
    articleUrl: "https://example.test/article-1",
    imageUrl: null,
    publishedAt: "2026-08-19T13:30:00.000Z",
    updatedAt: null,
    tickers: ["NVDA"],
    categories: ["guidance"],
    keywords: ["outlook"],
    publisher: { name: "Benzinga · Newsdesk", homepageUrl: null, logoUrl: null, faviconUrl: null },
    asOf: "2026-08-19T13:31:00.000Z",
    quality: "live",
    source: "benzinga",
    ...overrides,
  };
}

const filters = {
  scope: "all",
  tickers: "",
  sector: "",
  category: "all",
  dateFrom: "",
  dateTo: "",
  timeFrom: "",
  timeTo: "",
  source: "",
  recent: "all",
  unreadOnly: false,
  keyword: "",
};

test("news ticker parsing normalizes, deduplicates, and caps multi-symbol input", () => {
  assert.deepEqual(model.parseNewsTickers(" $nvda, amd  NVDA; brk.b "), ["NVDA", "AMD", "BRK.B"]);
  assert.deepEqual(model.parseNewsTickers("AAPL MSFT TSLA", 2), ["AAPL", "MSFT"]);
});

test("news filters use Eastern publication dates, time windows, source, keyword, and recent age", () => {
  const item = article();
  assert.deepEqual(model.easternPublicationParts(item.publishedAt), { date: "2026-08-19", time: "09:30" });
  assert.equal(model.matchesNewsFilters(item, {
    ...filters,
    dateFrom: "2026-08-19",
    dateTo: "2026-08-19",
    timeFrom: "09:00",
    timeTo: "10:00",
    source: "Benzinga",
    category: "guidance",
    keyword: "outlook",
    recent: "15",
  }, "2026-08-19T13:40:00.000Z"), true);
  assert.equal(model.matchesNewsFilters(item, { ...filters, timeFrom: "10:00" }, "2026-08-19T13:40:00.000Z"), false);
  assert.equal(model.matchesNewsFilters(item, { ...filters, recent: "5" }, "2026-08-19T13:40:00.000Z"), false);
});

test("historical news dateTo bounds convert the inclusive Eastern day exactly across DST", () => {
  assert.equal(model.easternInclusiveDateUpperBound("2026-08-19"), "2026-08-20T03:59:59.999Z");
  assert.equal(model.easternInclusiveDateUpperBound("2026-01-15"), "2026-01-16T04:59:59.999Z");
  assert.equal(model.easternInclusiveDateUpperBound("2026-02-30"), null);
  assert.match(liveNewsSource, /before: filters\.dateTo \? easternInclusiveDateUpperBound\(filters\.dateTo\)/);
});

test("AGE formatting and sorting are deterministic from the supplied clock", () => {
  const now = "2026-08-19T14:00:00.000Z";
  const newest = article({ id: "new", publishedAt: "2026-08-19T13:59:45.000Z" });
  const middle = article({ id: "middle", publishedAt: "2026-08-19T13:30:00.000Z" });
  const oldest = article({ id: "old", publishedAt: "2026-08-19T11:00:00.000Z" });
  assert.equal(model.formatNewsAge(newest.publishedAt, now), "NOW");
  assert.equal(model.formatNewsAge(middle.publishedAt, now), "30M");
  assert.equal(model.formatNewsAge(oldest.publishedAt, now), "3H");
  assert.deepEqual(
    model.sortNewsArticles([oldest, newest, middle], "age", "asc", now).map((item) => item.id),
    ["new", "middle", "old"],
  );
});

test("news UI derives scopes from returned data and uses selected durable watchlists", () => {
  assert.match(liveNewsSource, /useWatchlists\(\)/);
  assert.doesNotMatch(liveNewsSource, /CORE_WATCHLIST/);
  assert.match(liveNewsSource, /watchlists\.selected\?\.tickers/);
  assert.match(terminalSource, /categories\.map\(\(category\)/);
  assert.match(terminalSource, /TIME[\s\S]*TICKER[\s\S]*HEADLINE[\s\S]*CATEGORY[\s\S]*SOURCE[\s\S]*AGE/);
  assert.match(terminalSource, /ONLY UNREAD/);
});

test("read markers and structured news alerts stay owner-scoped at the personal API", () => {
  assert.match(personalRouteSource, /resource === "read-news"[\s\S]*where: \{ ownerId \}/);
  assert.match(personalRouteSource, /ownerId_source_articleId: \{ ownerId, source: input\.source, articleId: input\.articleId \}/);
  assert.match(personalRouteSource, /assertOwnedAlertWatchlist/);
  assert.match(personalRouteSource, /where: \{ id: watchlistId, ownerId \}/);
  assert.match(personalRouteSource, /cooldownMinutes/);
  assert.match(personalRouteSource, /deliveryChannels/);
});

test("notification permission is only requested from the explicit alert creation path", () => {
  assert.equal((liveNewsSource.match(/Notification\.requestPermission\(\)/g) ?? []).length, 1);
  assert.match(liveNewsSource, /const createNewsAlert = useCallback\([\s\S]*Notification\.requestPermission\(\)/);
  assert.match(terminalSource, /type="button"[\s\S]*CREATE NEWS ALERT/);
  assert.match(liveNewsSource, /schemaVersion: 1[\s\S]*ticker:[\s\S]*watchlistId:[\s\S]*keyword:[\s\S]*category:[\s\S]*browserNotification:[\s\S]*sound:/);
});
