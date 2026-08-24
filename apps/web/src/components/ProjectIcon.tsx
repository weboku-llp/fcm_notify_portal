"use client";

import { ImageIcon } from "lucide-react";

type Props = {
  src: string;
  alt: string;
  className?: string;
  /** Outer box size classes, e.g. h-14 w-14 */
  boxClassName?: string;
  darkBox?: boolean;
};

/** Renders project icons from /public paths, https URLs, or data:image uploads. */
export function ProjectIcon({ src, alt, className = "h-12 w-12 object-contain", boxClassName, darkBox }: Props) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic data URLs + arbitrary https
    <img src={src} alt={alt} className={className} />
  );
  if (!boxClassName) return img;
  return (
    <div
      className={`flex shrink-0 items-center justify-center ${boxClassName} ${
        darkBox ? "bg-black p-1" : "border border-line bg-surface-raised"
      }`}
    >
      {img}
    </div>
  );
}

export function ProjectIconPlaceholder({
  name,
  boxClassName = "h-14 w-14",
}: {
  name: string;
  boxClassName?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-line bg-surface-raised font-mono text-sm font-semibold uppercase text-ink-mute ${boxClassName}`}
    >
      {name.slice(0, 2) || <ImageIcon className="h-5 w-5" />}
    </div>
  );
}
