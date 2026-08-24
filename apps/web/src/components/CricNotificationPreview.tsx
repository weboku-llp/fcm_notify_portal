"use client";

import type { CricNotifTemplate } from "@notif/contracts";
import { useEffect, useMemo, useState } from "react";
import { projectLogo } from "@/lib/brand";

function MiniFlag({ src, label }: { src: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span className="inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded-[2px] bg-brand-100 px-0.5 text-[8px] font-bold text-brand-800">
        {label.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Shade preview that paints real flag images beside 3-letter codes.
 * Unicode regional flags are avoided — they show as "NA"/"ZA" on Windows.
 */
export function CricNotificationPreview({
  template,
  appName = "CricRumble",
  appSlug = "cricrumble",
  logoUrl,
  className = "",
}: {
  template: CricNotifTemplate;
  appName?: string;
  appSlug?: string | null;
  logoUrl?: string | null;
  className?: string;
}) {
  const logo = useMemo(
    () => projectLogo({ slug: appSlug, name: appName, logoUrl }),
    [appSlug, appName, logoUrl],
  );

  const nowLabel = useMemo(
    () =>
      new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
    [],
  );

  return (
    <div className={`select-none ${className}`}>
      <div className="mx-auto w-full max-w-[300px]">
        <div className="overflow-hidden rounded-[28px] border border-[#1a1d24] bg-[#0c0e12] shadow-[0_18px_40px_-18px_rgba(11,13,18,0.55)]">
          <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[10px] font-medium tracking-wide text-white/70">
            <span>{nowLabel}</span>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-3 rounded-sm bg-white/50" />
              <span className="inline-block h-2 w-2 rounded-full border border-white/50" />
              <span className="inline-block h-2.5 w-5 rounded-sm border border-white/50">
                <span className="ml-0.5 mt-[2px] inline-block h-1.5 w-3 rounded-[1px] bg-white/70" />
              </span>
            </div>
          </div>

          <div
            className="relative px-3 pb-4 pt-2"
            style={{
              background:
                "radial-gradient(120% 80% at 20% 0%, #1e3a5f 0%, transparent 55%), linear-gradient(165deg, #152033 0%, #0f1218 48%, #12161e 100%)",
            }}
          >
            <p className="mb-3 text-center text-[11px] font-medium tracking-[0.08em] text-white/35">
              NOTIFICATION SHADE
            </p>

            <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[rgba(248,249,252,0.94)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="flex items-start gap-2.5 px-3.5 pb-3 pt-3">
                <div className="relative mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-[8px] bg-brand-50 ring-1 ring-black/5">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-brand-600 text-[11px] font-bold text-white">
                      C
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[11px] font-semibold text-ink">{appName}</span>
                    <span className="text-[10px] text-ink-faint">·</span>
                    <span className="text-[10px] text-ink-faint">now</span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] font-semibold leading-snug text-ink">
                    <MiniFlag src={template.flagHomeUrl} label={template.shortHome} />
                    <span>{template.shortHome}</span>
                    <span className="text-ink-faint">vs</span>
                    <MiniFlag src={template.flagAwayUrl} label={template.shortAway} />
                    <span>{template.shortAway}</span>
                  </div>

                  <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-ink-mute">{template.body}</p>
                </div>
              </div>
            </div>

            <p className="mt-2.5 text-center text-[10px] text-white/30">
              Phone title uses flag emoji + codes · shade preview uses flag images
            </p>
          </div>

          <div className="flex justify-center bg-[#0c0e12] pb-3 pt-1">
            <div className="h-1 w-24 rounded-full bg-white/25" />
          </div>
        </div>
      </div>
    </div>
  );
}
