import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { buildXArchiveHtml } from "../browser-extension/src/utils/xArchiveHtml";
import type { XCapture } from "../browser-extension/src/utils/xArchiveHtml";

function captureWithImages(imageCount: number): XCapture {
  return {
    title: "X image post",
    sourceUrl: "https://x.com/example/status/1",
    mainPost: {
      id: "1",
      author: "Example",
      handle: "@example",
      url: "https://x.com/example/status/1",
      publishedAt: "2026-09-10T00:00:00.000Z",
      text: "A sufficiently detailed main post body for Reader View extraction. ".repeat(
        12,
      ),
      media: Array.from({ length: imageCount }, (_, index) => ({
        kind: "image" as const,
        url: `https://pbs.twimg.com/media/image-${index + 1}.jpg`,
      })),
    },
    replies: [],
    markdown: "",
  };
}

describe("buildXArchiveHtml", () => {
  test("keeps ordinary X post images in Reader View", () => {
    const archive = buildXArchiveHtml(captureWithImages(4));
    const dom = new JSDOM(archive, {
      url: "https://x.com/example/status/1",
    });
    const reader = new Readability(dom.window.document).parse();

    expect(archive).toContain('<figure class="media">');
    expect(reader).not.toBeNull();
    expect(reader?.content).toBeTruthy();
    expect(
      new JSDOM(reader?.content ?? "").window.document.querySelectorAll("img"),
    ).toHaveLength(4);
  });

  test("uses a full-width media row for a single image", () => {
    const archive = buildXArchiveHtml(captureWithImages(1));

    expect(archive).toContain('<figure class="media media-single">');
    expect(archive).toContain(
      ".media{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))",
    );
  });
});
