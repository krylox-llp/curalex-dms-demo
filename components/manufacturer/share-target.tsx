"use client";

import { useEffect } from "react";
import { setShareTarget, useShareTarget, type ShareTarget } from "@/components/manufacturer/selection";

/**
 * On the Documents page: when opened from an exporter's page (?to=…), remembers that exporter
 * as the recipient and shows a banner while files are being picked.
 */
export function ShareTargetBanner({ fromUrl }: { fromUrl: ShareTarget }) {
  const target = useShareTarget();

  useEffect(() => {
    if (fromUrl) setShareTarget(fromUrl);
  }, [fromUrl]);

  const shown = target ?? fromUrl;
  if (!shown) return null;
  return (
    <div className="notice mb-4 items-center justify-between">
      <span>
        Select the files to share with <strong className="font-semibold">{shown.name}</strong>, then click Share.
      </span>
      <button type="button" className="btn-tertiary btn-sm" onClick={() => setShareTarget(null)}>
        Cancel
      </button>
    </div>
  );
}
