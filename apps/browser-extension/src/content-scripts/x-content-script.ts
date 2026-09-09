import {
  semanticizeXArticleBlocks,
  xArticleBlocksToMarkdown,
} from "../utils/xArticleHtml";

type XMedia = { kind: "image" | "video"; url: string };

type XPost = {
  id: string;
  author: string;
  handle: string;
  url: string;
  publishedAt: string;
  text: string;
  media: XMedia[];
};

type XCapture = {
  title: string;
  sourceUrl: string;
  mainPost: XPost;
  replies: XPost[];
  markdown: string;
  articleHtml?: string;
};

declare global {
  interface Window {
    __karakeepXCaptureLoaded__?: boolean;
  }
}

if (window.__karakeepXCaptureLoaded__) {
  throw new Error("Karakeep X capture content script already loaded");
}
window.__karakeepXCaptureLoaded__ = true;

const MAX_VISIBLE_POSTS = 30;

function cleanText(value?: string | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeRichText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function statusIdFromUrl(value: string): string | undefined {
  return value.match(/\/status\/(\d+)/)?.[1];
}

function canonicalUrl(value: string): string {
  const url = new URL(value, window.location.origin);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function textWithLinks(root: Element): string {
  let text = "";
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === "BR") {
      text += "\n";
      continue;
    }
    if (node.tagName === "A" && node instanceof HTMLAnchorElement) {
      const url = canonicalUrl(node.href);
      const label = /\/status\/\d+/.test(url)
        ? url
        : cleanText(node.textContent) || url;
      text += `[${label}](${url})`;
      continue;
    }
    text += textWithLinks(node);
  }
  return normalizeRichText(text);
}

function mediaFromRoot(root: Element): XMedia[] {
  const images = [
    ...root.querySelectorAll<HTMLImageElement>('img[src*="twimg.com/media"]'),
  ];
  const videos = [...root.querySelectorAll<HTMLVideoElement>("video")];
  return [...images, ...videos]
    .filter((item, index, all) => all.indexOf(item) === index)
    .map((item): XMedia | undefined => {
      if (item instanceof HTMLImageElement) {
        return { kind: "image", url: item.currentSrc || item.src };
      }
      if (item.currentSrc && !item.currentSrc.startsWith("blob:")) {
        return { kind: "video", url: item.currentSrc };
      }
      return undefined;
    })
    .filter((item): item is XMedia => Boolean(item));
}

function articleText(root: Element): string {
  // X Articles use a separate article tree and do not expose tweetText.
  // Drop engagement counters while retaining headings, paragraphs and lists.
  return normalizeRichText(
    (root as HTMLElement).innerText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !/^\d+(?:\.\d+)?[KM]?$/i.test(line))
      .join("\n"),
  );
}

function articleContent(
  root: Element,
): { html: string; markdown: string } | undefined {
  const content = root.querySelector(
    '[data-testid="twitterArticleRichTextView"]',
  );
  if (!content) return undefined;

  // Keep the already-rendered DOM order: X Articles interleave prose, headings,
  // lists and media. Flattening it into text loses that sequence.
  const clone = content.cloneNode(true) as HTMLElement;
  const body = clone.querySelector("[data-contents]") || clone;
  for (const element of body.querySelectorAll("script, style, button, svg")) {
    element.remove();
  }
  for (const image of body.querySelectorAll<HTMLImageElement>("img")) {
    const source = image.currentSrc || image.src;
    if (source) image.src = source;
    image.removeAttribute("srcset");
    image.removeAttribute("style");
    image.loading = "lazy";
  }
  for (const link of body.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const wrapper = link.parentElement;
    const previous = wrapper?.previousElementSibling;
    const isStandaloneLink =
      wrapper &&
      previous &&
      !wrapper.querySelector("img") &&
      !previous.querySelector("img") &&
      cleanText(wrapper.textContent) === cleanText(link.textContent) &&
      cleanText(previous.textContent);
    if (!isStandaloneLink) continue;

    // Readability drops a trailing block that contains only a URL. X uses that
    // markup after prose such as "repo:"; keep the link with its preceding text.
    previous.append(document.createTextNode(" "), link);
    wrapper.remove();
  }
  // Readability conditionally removes generic divs and dropped the final
  // paragraph of a real X Article. Preserve X's order while giving prose
  // blocks their correct semantic element before Karakeep parses the archive.
  semanticizeXArticleBlocks(body);
  for (const link of body.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    link.href = canonicalUrl(link.href);
    link.target = "_blank";
    link.rel = "noreferrer";
  }
  return { html: body.innerHTML, markdown: xArticleBlocksToMarkdown(body) };
}

function extractPost(article: Element): XPost | undefined {
  const time = article.querySelector("time");
  const statusLink =
    time?.closest<HTMLAnchorElement>('a[href*="/status/"]') ||
    article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
  if (!statusLink) return undefined;
  const url = canonicalUrl(statusLink.href);
  const id = statusIdFromUrl(url);
  if (!id) return undefined;

  const profileLinks = [
    ...article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'),
  ];
  const handleLink = profileLinks.find((link) =>
    cleanText(link.textContent).startsWith("@"),
  );
  const authorLink = profileLinks.find(
    (link) => !cleanText(link.textContent).startsWith("@"),
  );
  const userName = article.querySelector('[data-testid="User-Name"]');
  const textNode = article.querySelector('[data-testid="tweetText"]');
  const media = mediaFromRoot(article);

  return {
    id,
    author:
      cleanText(authorLink?.textContent) ||
      cleanText(userName?.textContent)
        .replace(/@[A-Za-z0-9_]+/, "")
        .trim(),
    handle:
      cleanText(handleLink?.textContent) ||
      cleanText(userName?.textContent).match(/@[A-Za-z0-9_]+/)?.[0] ||
      "",
    url,
    publishedAt: time?.dateTime || "",
    text: textNode ? textWithLinks(textNode) : "",
    media,
  };
}

function postToMarkdown(
  post: XPost,
  label: string,
  includeMedia = true,
): string {
  const lines = [
    `### ${label}`,
    `- 作者：${post.author} ${post.handle}`,
    `- 链接：${post.url}`,
  ];
  if (post.publishedAt) lines.push(`- 时间：${post.publishedAt}`);
  if (post.text) lines.push("", post.text);
  if (includeMedia) {
    for (const media of post.media) lines.push(`- 媒体：${media.url}`);
  }
  return lines.join("\n");
}

function captureLoadedXContent(includeReplies: boolean): XCapture {
  const currentId = statusIdFromUrl(location.href);
  if (!currentId) throw new Error("请在 X 推文详情页使用此功能。");

  const posts: XPost[] = [];
  const seen = new Set<string>();
  for (const article of document.querySelectorAll(
    'article[data-testid="tweet"]',
  )) {
    const post = extractPost(article);
    if (!post || seen.has(post.id)) continue;
    posts.push(post);
    seen.add(post.id);
    if (posts.length >= MAX_VISIBLE_POSTS) break;
  }
  const mainPost = posts.find((post) => post.id === currentId);
  if (!mainPost) throw new Error("没有读到主推文。请等待页面加载完成后重试。");

  const renderedArticle = document.querySelector(
    'article[data-testid="twitterArticleReadView"]',
  );
  let renderedArticleHtml: string | undefined;
  let renderedArticleMarkdown: string | undefined;
  if (renderedArticle) {
    const renderedText = articleText(renderedArticle);
    if (renderedText) mainPost.text = renderedText;
    const renderedContent = articleContent(renderedArticle);
    renderedArticleHtml = renderedContent?.html;
    renderedArticleMarkdown = renderedContent?.markdown;
    const articleMedia = mediaFromRoot(renderedArticle);
    mainPost.media = [...mainPost.media, ...articleMedia].filter(
      (media, index, all) =>
        all.findIndex((candidate) => candidate.url === media.url) === index,
    );
  }

  const replies = includeReplies
    ? posts.filter(
        (post) => post.id !== mainPost.id && post.handle === mainPost.handle,
      )
    : [];
  const title = `${mainPost.author || mainPost.handle || "X"} on X: ${(mainPost.text || "已加载内容").slice(0, 120)}`;
  const markdown = [
    "## X 已加载内容摘录",
    "",
    "仅包含浏览器已展示的主推文及同作者回复；不读取 Cookie，也不向服务端提交整页归档。",
    "",
    postToMarkdown(
      { ...mainPost, text: renderedArticleMarkdown || mainPost.text },
      "主推文",
      !renderedArticleMarkdown,
    ),
    ...replies.map((reply, index) =>
      postToMarkdown(reply, `作者回复 ${index + 1}`),
    ),
  ].join("\n\n");
  return {
    title,
    sourceUrl: mainPost.url,
    mainPost,
    replies,
    markdown,
    articleHtml: renderedArticleHtml,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "KARAKEEP_CAPTURE_LOADED_X") return;
  try {
    sendResponse({
      ok: true,
      capture: captureLoadedXContent(message.includeReplies !== false),
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
