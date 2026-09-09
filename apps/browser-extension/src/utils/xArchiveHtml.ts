export interface XMedia {
  kind: "image" | "video";
  url: string;
}

export interface XPost {
  id: string;
  author: string;
  handle: string;
  url: string;
  publishedAt: string;
  text: string;
  media: XMedia[];
}

export interface XCapture {
  title: string;
  sourceUrl: string;
  mainPost: XPost;
  replies: XPost[];
  markdown: string;
  articleHtml?: string;
}

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
    const mediaItems = `${images}${videos}`;
    const media =
      contentHtml || !mediaItems
        ? ""
        : `<figure class="media${post.media.length === 1 ? " media-single" : ""}">${mediaItems}</figure>`;
    return `<article><h2>${escapeHtml(heading)}</h2><p class="meta">${escapeHtml(post.author)} ${escapeHtml(post.handle)} · ${escapeHtml(post.publishedAt)}</p><p class="meta"><a href="${escapeHtml(post.url)}">查看原推文</a></p><div class="text${contentHtml ? " x-article-content" : ""}">${content}</div>${media}</article>`;
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(capture.title)}</title><style>body{max-width:1040px;margin:32px auto;padding:0 18px;font:16px/1.6 system-ui,sans-serif;color:#172033}body>h1,body>.meta,article>h2,article>.meta,article>.text{max-width:760px;margin-left:auto;margin-right:auto}article{border-bottom:1px solid #dde3ed;padding:20px 0}.meta{color:#637086;font-size:14px}.media{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0 0;padding:0}.media-single{grid-template-columns:1fr}.media img{display:block;width:100%;max-width:100%;height:auto;border-radius:6px}@media(max-width:700px){.media{grid-template-columns:1fr}}.x-article-content{font-family:Georgia,"Noto Serif SC",serif;font-size:18px;line-height:1.75}.x-article-content>p,.x-article-content>figure,.x-article-content>blockquote,.x-article-content>ul,.x-article-content>ol{margin:1.3em 0}.x-article-content h1,.x-article-content h2,.x-article-content h3{font-family:system-ui,sans-serif;line-height:1.3;margin:1.8em 0 .7em}.x-article-content figure{padding:0}.x-article-content img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:6px}.x-article-content a{color:#2563eb;overflow-wrap:anywhere}.x-article-content blockquote{margin-left:0;padding-left:16px;border-left:3px solid #cbd5e1;color:#475569}.x-article-content ul,.x-article-content ol{padding-left:1.5em}</style></head><body><h1>${escapeHtml(capture.title)}</h1><p class="meta">本页由浏览器从已加载的 X 内容生成；采集时间：${escapeHtml(new Date().toISOString())}</p>${postHtml(capture.mainPost, "主推文", capture.articleHtml)}${capture.replies.map((reply, index) => postHtml(reply, `作者回复 ${index + 1}`)).join("")}</body></html>`;
}
