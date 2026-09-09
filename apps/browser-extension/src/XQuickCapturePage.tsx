import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import Spinner from "./Spinner";
import { MessageType } from "./utils/type";
import { getLoadedXCapture, saveXArchive } from "./utils/xCapture";

export default function XQuickCapturePage() {
  const navigate = useNavigate();
  const [includeReplies, setIncludeReplies] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  const save = async () => {
    setError(undefined);
    setIsSaving(true);
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) throw new Error("未找到当前标签页。");
      const capture = await getLoadedXCapture(tab.id, includeReplies);
      const bookmark = await saveXArchive(capture);
      await chrome.runtime.sendMessage({
        type: MessageType.BOOKMARK_REFRESH_BADGE,
        currentTab: tab,
      });
      navigate(`/bookmark/${bookmark.id}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isSaving) {
    return (
      <div className="flex justify-between text-lg">
        <span>Saving loaded X content</span>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-lg font-medium">Save loaded X content</p>
        <p className="text-xs text-muted-foreground">
          先在 X 手动展开要保留的作者回复；此模式不读取 Cookie，也不进行服务端 X
          抓取。
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeReplies}
          onChange={(event) => setIncludeReplies(event.target.checked)}
        />
        包含已加载的同作者回复
      </label>
      <p className="text-xs text-muted-foreground">
        保存为轻量 Archived
        Page，正文仍可搜索；图片会在归档页中保留其原始媒体链接。
      </p>
      <Button onClick={save} className="w-full">
        保存当前已加载内容
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
