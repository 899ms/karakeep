export type XMedia = { kind: "image" | "video"; url: string };

export type XPost = {
  id: string;
  author: string;
  handle: string;
  url: string;
  publishedAt: string;
  text: string;
  media: XMedia[];
};

export type XCapture = {
  title: string;
  sourceUrl: string;
  mainPost: XPost;
  replies: XPost[];
  markdown: string;
  articleHtml?: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] || character,
  );
}

function renderRichText(value: string): string {
  const linked = escapeHtml(value).replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return linked
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function buildXArchiveHtml(capture: XCapture): string {
  const postHtml = (post: XPost, heading: string, contentHtml?: string) => {
    const images = post.media
      .filter((media) => media.kind === "image" && media.url)
      .map(
        (media) =>
          `<img src="${escapeHtml(media.url)}" alt="X media" loading="lazy">`,
      )
      .join("");
    const videos = post.media
      .filter((media) => media.kind === "video" && media.url)
      .map((media) => `<p><a href="${escapeHtml(media.url)}">视频链接</a></p>`)
      .join("");
    const content = contentHtml || renderRichText(post.text);
    const media = contentHtml
      ? ""
      : `<div class="media">${images}${videos}</div>`;
    return `<article><h2>${escapeHtml(heading)}</h2><p class="meta">${escapeHtml(post.author)} ${escapeHtml(post.handle)} · ${escapeHtml(post.publishedAt)}</p><p class="meta"><a href="${escapeHtml(post.url)}">查看原推文</a></p><div class="text${contentHtml ? " x-article-content" : ""}">${content}</div>${media}</article>`;
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(capture.title)}</title><style>body{max-width:760px;margin:32px auto;padding:0 18px;font:16px/1.6 system-ui,sans-serif;color:#172033}article{border-bottom:1px solid #dde3ed;padding:20px 0}.meta{color:#637086;font-size:14px}.media{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:16px}.media img{max-width:100%;height:auto;border-radius:6px}.x-article-content{font-family:Georgia,"Noto Serif SC",serif;font-size:18px;line-height:1.75}.x-article-content>div,.x-article-content>section,.x-article-content>blockquote,.x-article-content>ul,.x-article-content>ol{margin:1.3em 0}.x-article-content h1,.x-article-content h2,.x-article-content h3{font-family:system-ui,sans-serif;line-height:1.3;margin:1.8em 0 .7em}.x-article-content img{display:block;max-width:100%;height:auto;margin:1.4em auto;border-radius:6px}.x-article-content a{color:#2563eb;overflow-wrap:anywhere}.x-article-content blockquote{margin-left:0;padding-left:16px;border-left:3px solid #cbd5e1;color:#475569}.x-article-content ul,.x-article-content ol{padding-left:1.5em}</style></head><body><h1>${escapeHtml(capture.title)}</h1><p class="meta">本页由浏览器从已加载的 X 内容生成；采集时间：${escapeHtml(new Date().toISOString())}</p>${postHtml(capture.mainPost, "主推文", capture.articleHtml)}${capture.replies.map((reply, index) => postHtml(reply, `作者回复 ${index + 1}`)).join("")}</body></html>`;
}

export async function saveXArchive(capture: XCapture): Promise<{ id: string }> {
  const settings = await getPluginSettings();
  const formData = new FormData();
  formData.append("url", capture.sourceUrl);
  formData.append(
    "file",
    new File([buildXArchiveHtml(capture)], "x-loaded-content.html", {
      type: "text/html",
    }),
  );
  const headers: HeadersInit = { Authorization: `Bearer ${settings.apiKey}` };
  for (const [key, value] of Object.entries(settings.customHeaders)) {
    headers[key] = value;
  }
  const baseUrl = settings.address.replace(/\/$/, "");
  const response = await fetch(
    `${baseUrl}/api/v1/bookmarks/singlefile?ifexists=overwrite-recrawl`,
    { method: "POST", headers, body: formData },
  );
  if (!response.ok) {
    throw new Error(
      `X 归档上传失败：${response.status} ${await response.text()}`,
    );
  }
  const bookmark = (await response.json()) as { id: string };
  const updateResponse = await fetch(
    `${baseUrl}/api/v1/bookmarks/${bookmark.id}`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: capture.title, note: capture.markdown }),
    },
  );
  if (!updateResponse.ok) {
    throw new Error(`X 归档笔记更新失败：${updateResponse.status}`);
  }
  return bookmark;
}

export async function getLoadedXCapture(
  tabId: number,
  includeReplies: boolean,
): Promise<XCapture> {
  const send = () =>
    chrome.tabs.sendMessage(tabId, {
      type: "KARAKEEP_CAPTURE_LOADED_X",
      includeReplies,
    });
  let response: { ok: boolean; capture?: XCapture; error?: string };
  try {
    response = await send();
  } catch (error) {
    if (
      !/Could not establish connection|Receiving end does not exist/i.test(
        String(error),
      )
    )
      throw error;
    const contentScripts = chrome.runtime.getManifest().content_scripts;
    const files = contentScripts?.find((script) =>
      script.js?.some((file) => file.includes("x-content-script")),
    )?.js;
    if (!files?.length) throw new Error("X 采集脚本未在扩展清单中声明。");
    const urls = files.map((file) => chrome.runtime.getURL(file));
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (moduleUrls: string[]) => {
        for (const url of moduleUrls) await import(/* @vite-ignore */ url);
        return true;
      },
      args: [urls],
    });
    if (!result?.result) throw new Error("无法向当前 X 标签页加载采集脚本。");
    response = await send();
  }
  if (!response.ok || !response.capture)
    throw new Error(response.error || "未能读取当前 X 页面。");
  return response.capture;
}
import { getPluginSettings } from "./settings";
