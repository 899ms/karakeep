import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { semanticizeXArticleBlocks } from "../browser-extension/src/utils/xArticleHtml";

describe("semanticizeXArticleBlocks", () => {
  test("preserves a trailing X Article paragraph and its link for Reader View", () => {
    const dom = new JSDOM(
      `<!doctype html><html><head><title>Article</title></head><body>
      <article>
        <div data-testid="twitterArticleRichTextView">
          <div class="longform-unstyled">The preceding article paragraph contains enough text to be readable.</div>
          <div class="longform-unstyled">If you need persistent context, try this repo:
            <a href="https://github.com/EverMind-AI/EverOS">https://github.com/EverMind-AI/EverOS</a>
          </div>
          <section><img src="https://example.com/article.png" alt="diagram"></section>
        </div>
      </article>
    </body></html>`,
      { url: "https://x.com/example/status/1" },
    );
    const content = dom.window.document.querySelector(
      '[data-testid="twitterArticleRichTextView"]',
    );
    expect(content).not.toBeNull();

    semanticizeXArticleBlocks(content!);

    expect(content!.querySelectorAll("div.longform-unstyled")).toHaveLength(0);
    expect(content!.querySelectorAll("p.longform-unstyled")).toHaveLength(2);
    expect(content!.querySelector("section img")).not.toBeNull();

    const parsed = new Readability(dom.window.document).parse();
    expect(parsed?.textContent).toContain("try this repo:");
    expect(parsed?.content).toContain("https://github.com/EverMind-AI/EverOS");
  });
});
