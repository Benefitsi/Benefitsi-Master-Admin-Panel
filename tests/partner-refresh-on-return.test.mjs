import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { loadTypescript } from "./helpers/load-typescript.mjs";
test("return refresh rereads idle views but does not discard a changed form", async () => {
  let refreshes = 0,
    now = 100000;
  const oldNow = Date.now;
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const originals = new Map(
    ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"].map(
      (k) => [k, globalThis[k]],
    ),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Date.now = () => now;
  const router = { refresh: () => refreshes++ };
  const { PartnerRefreshOnReturn } = loadTypescript(
    "components/partner/partner-refresh-on-return.tsx",
    { "next/navigation": { useRouter: () => router } },
    {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Date,
    },
  );
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () =>
      root.render(
        h(
          "div",
          null,
          h(PartnerRefreshOnReturn),
          h("form", null, h("input", { name: "name" })),
        ),
      ),
    );
    now += 46000;
    await act(async () => window.dispatchEvent(new dom.window.Event("focus")));
    assert.equal(refreshes, 1);
    await act(async () =>
      document
        .querySelector("input")
        .dispatchEvent(new dom.window.Event("input", { bubbles: true })),
    );
    now += 46000;
    await act(async () => window.dispatchEvent(new dom.window.Event("focus")));
    assert.equal(refreshes, 1);
  } finally {
    await act(async () => root.unmount());
    Date.now = oldNow;
    for (const [k, v] of originals) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    dom.window.close();
  }
});
