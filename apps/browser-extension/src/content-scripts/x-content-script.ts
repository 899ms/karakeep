export {};

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
  const images = [
    ...article.querySelectorAll<HTMLImageElement>(
      'img[src*="twimg.com/media"]',
    ),
  ];
  const videos = [...article.querySelectorAll<HTMLVideoElement>("video")];
  const media = [...images, ...videos]
    .filter((item, index, all) => all.indexOf(item) === index)
    .map((item): XMedia | undefined => {
      if (item instanceof HTMLImageElement)
        return { kind: "image", url: item.currentSrc || item.src };
      if (item.currentSrc && !item.currentSrc.startsWith("blob:"))
        return { kind: "video", url: item.currentSrc };
      return undefined;
    })
    .filter((item): item is XMedia => Boolean(item));

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

function postToMarkdown(post: XPost, label: string): string {
  const lines = [
    `### ${label}`,
    `- 作者：${post.author} ${post.handle}`,
    `- 链接：${post.url}`,
  ];
  if (post.publishedAt) lines.push(`- 时间：${post.publishedAt}`);
  if (post.text) lines.push("", post.text);
  for (const media of post.media) lines.push(`- 媒体：${media.url}`);
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
    postToMarkdown(mainPost, "主推文"),
    ...replies.map((reply, index) =>
      postToMarkdown(reply, `作者回复 ${index + 1}`),
    ),
  ].join("\n\n");
  return { title, sourceUrl: mainPost.url, mainPost, replies, markdown };
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
