"use client";

import { useEffect, useMemo, useState } from "react";
import { projectLogo } from "@/lib/brand";

export type NotificationPreviewProps = {
  title: string;
  body: string;
  imageUrl?: string | null;
  appName?: string;
  appSlug?: string | null;
  logoUrl?: string | null;
  /** Compact = shade row; expanded = big-picture style */
  defaultExpanded?: boolean;
  className?: string;
};

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim()) || value.trim().startsWith("/");
}

export function NotificationPreview({
  title,
  body,
  imageUrl,
  appName = "App",
  appSlug,
  logoUrl,
  defaultExpanded = true,
  className = "",
}: NotificationPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [imgFailed, setImgFailed] = useState(false);

  const logo = useMemo(
    () => projectLogo({ slug: appSlug, name: appName, logoUrl }),
    [appSlug, appName, logoUrl],
  );

  const resolvedImage = imageUrl?.trim() ?? "";

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedImage]);

  const showImage = Boolean(resolvedImage && looksLikeUrl(resolvedImage) && !imgFailed);
  const displayTitle = title.trim() || "Notification title";
  const displayBody = body.trim() || "Notification body will appear here.";
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

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-left transition"
              aria-label="Toggle notification preview size"
            >
              <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[rgba(248,249,252,0.94)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <div className="flex items-start gap-2.5 px-3.5 pb-2 pt-3">
                  <div className="relative mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-[8px] bg-brand-50 ring-1 ring-black/5">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo.src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-brand-600 text-[11px] font-bold text-white">
                        {(appName || "A").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] font-semibold text-ink">{appName}</span>
                      <span className="text-[10px] text-ink-faint">·</span>
                      <span className="text-[10px] text-ink-faint">now</span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] font-semibold leading-snug text-ink">
                      {displayTitle}
                    </p>
                    {!expanded || !showImage ? (
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-mute">{displayBody}</p>
                    ) : null}
                  </div>
                </div>

                {expanded && showImage ? (
                  <div className="relative mx-3 mb-2 overflow-hidden rounded-[12px] bg-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedImage}
                      alt=""
                      className="aspect-[16/9] w-full object-cover"
                      onError={() => setImgFailed(true)}
                    />
                  </div>
                ) : null}

                {expanded && showImage ? (
                  <p className="px-3.5 pb-3 text-[12px] leading-snug text-ink-mute">{displayBody}</p>
                ) : null}

                {!showImage && resolvedImage ? (
                  <div className="mx-3 mb-3 overflow-hidden rounded-[12px] border border-dashed border-line bg-surface-raised px-3 py-4 text-center">
                    <p className="text-[11px] font-medium text-ink-mute">Image placeholder</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-ink-faint">{resolvedImage}</p>
                  </div>
                ) : null}

                {expanded && !resolvedImage ? (
                  <div
                    className="mx-3 mb-3 flex aspect-[16/9] items-end overflow-hidden rounded-[12px] px-3 pb-2.5"
                    style={{
                      background: "linear-gradient(135deg, #1a6be8 0%, #0b3d7a 55%, #0c0e12 100%)",
                    }}
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                        Optional image
                      </p>
                      <p className="text-[12px] font-medium text-white/90">Add an Image URL for rich push</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </button>

            <p className="mt-2.5 text-center text-[10px] text-white/30">
              Tap card to {expanded ? "collapse" : "expand"}
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
