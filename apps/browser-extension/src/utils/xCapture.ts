import { getPluginSettings } from "./settings";
import { buildXArchiveHtml } from "./xArchiveHtml";
import type { XCapture } from "./xArchiveHtml";

export {
  buildXArchiveHtml,
  type XCapture,
  type XMedia,
  type XPost,
} from "./xArchiveHtml";

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
