import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import {
  semanticizeXArticleBlocks,
  xArticleBlocksToMarkdown,
} from "../browser-extension/src/utils/xArticleHtml";

describe("semanticizeXArticleBlocks", () => {
  test("creates valid paragraphs and headings without X media placeholders", () => {
    const dom = new JSDOM(
      `<!doctype html><html><head><title>Article</title></head><body>
      <article>
        <div data-testid="twitterArticleRichTextView">
          <div data-contents="true">
            <div class="longform-unstyled"><div class="public-DraftStyleDefault-block"><span>The preceding article paragraph contains enough text to be readable.</span></div></div>
            <div style="color: rgb(15, 20, 25)"><h2 class="longform-header-two"><div class="public-DraftStyleDefault-block"><span>一、长上下文解决当前任务，Memory 解决跨任务复利</span></div></h2></div>
            <section><a href="https://x.com/example/media/1"><div><div style="padding-bottom: 98.4211%"></div><div><img src="https://example.com/article.png" alt="diagram"></div></div></a></section>
            <div class="longform-unstyled"><div class="public-DraftStyleDefault-block"><span>If you need persistent context, try this repo:
              <a href="https://github.com/EverMind-AI/EverOS">https://github.com/EverMind-AI/EverOS</a>
            </span></div></div>
          </div>
        </div>
      </article>
    </body></html>`,
      { url: "https://x.com/example/status/1" },
    );
    const content = dom.window.document.querySelector(
      '[data-testid="twitterArticleRichTextView"]',
    );
    expect(content).not.toBeNull();
    const body = content!.querySelector("[data-contents]");
    expect(body).not.toBeNull();

    semanticizeXArticleBlocks(body!);

    expect(body!.querySelectorAll("div.longform-unstyled")).toHaveLength(0);
    expect(body!.querySelectorAll(":scope > p")).toHaveLength(2);
    expect(body!.querySelector(":scope > h2")).not.toBeNull();
    expect(body!.querySelector("h2 > div")).toBeNull();
    expect(body!.querySelector("p > div")).toBeNull();
    expect(body!.querySelector("[style]")).toBeNull();
    expect(body!.querySelector("section")).toBeNull();
    expect(body!.querySelector("figure > img")).not.toBeNull();

    const reparsed = new JSDOM(body!.innerHTML).window.document;
    expect(reparsed.querySelector("p:empty")).toBeNull();

    const markdown = xArticleBlocksToMarkdown(body!);
    expect(markdown).toContain(
      "## 一、长上下文解决当前任务，Memory 解决跨任务复利",
    );
    expect(markdown).toContain("![diagram](https://example.com/article.png)");
    expect(markdown.indexOf("## 一、")).toBeLessThan(
      markdown.indexOf("![diagram]"),
    );
    expect(markdown.indexOf("![diagram]")).toBeLessThan(
      markdown.indexOf("try this repo"),
    );

    const parsed = new Readability(dom.window.document).parse();
    expect(parsed?.textContent).toContain(
      "一、长上下文解决当前任务，Memory 解决跨任务复利",
    );
    expect(parsed?.textContent).toContain("try this repo:");
    expect(parsed?.content).toContain("https://github.com/EverMind-AI/EverOS");
  });
});
