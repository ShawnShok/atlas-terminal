import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/workspace/model.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "model.ts",
  reportDiagnostics: true,
});

const syntaxErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(syntaxErrors, []);

const workspace = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);

const { DEFAULT_WORKSPACES, getPanels, workspaceReducer } = workspace;

test("ships three valid, versioned default layouts", () => {
  assert.deepEqual(DEFAULT_WORKSPACES.map(({ id }) => id), ["research", "monitor", "focus"]);
  for (const layout of DEFAULT_WORKSPACES) {
    assert.equal(layout.version, 1);
    assert.ok(getPanels(layout.root).length >= 1);
  }
});

test("splits a panel without losing the original panel", () => {
  const initial = DEFAULT_WORKSPACES[2];
  const nextPanel = {
    type: "panel",
    id: "new-panel",
    title: "New panel",
    ticker: "AMD",
    view: "security",
  };
  const next = workspaceReducer(initial, {
    type: "split",
    panelId: "focus-security",
    direction: "horizontal",
    panel: nextPanel,
  });

  assert.deepEqual(getPanels(next.root).map(({ id }) => id), ["focus-security", "new-panel"]);
  assert.equal(next.root.direction, "horizontal");
  assert.equal(next.root.ratio, 50);
});

test("closing collapses a split and never removes the final panel", () => {
  const research = DEFAULT_WORKSPACES[0];
  const closed = workspaceReducer(research, { type: "close", panelId: "research-market" });
  assert.equal(getPanels(closed.root).length, 2);
  assert.equal(getPanels(closed.root).some(({ id }) => id === "research-market"), false);

  const focus = DEFAULT_WORKSPACES[2];
  assert.equal(workspaceReducer(focus, { type: "close", panelId: "focus-security" }), focus);
});

test("resize clamps panel ratios and ticker changes remain normalized", () => {
  const research = DEFAULT_WORKSPACES[0];
  const tooSmall = workspaceReducer(research, { type: "resize", splitId: "research-primary", ratio: 2 });
  assert.equal(tooSmall.root.ratio, 24);
  const tooLarge = workspaceReducer(research, { type: "resize", splitId: "research-primary", ratio: 99 });
  assert.equal(tooLarge.root.ratio, 76);

  const renamed = workspaceReducer(research, { type: "set-ticker", panelId: "research-security", ticker: "brk.b" });
  assert.equal(getPanels(renamed.root)[0].ticker, "BRK.B");
});
