import type { ReactNode } from "react";

type HomeMediaCardProps = {
  children: ReactNode;
  imageUrl: string;
  compact?: boolean;
};

export function HomeMediaCard({ children, imageUrl, compact = false }: HomeMediaCardProps) {
  return (
    <article
      className={`home-media-card media-card min-w-0 overflow-hidden ${compact ? "home-media-card--compact" : ""}`}
      style={{ backgroundImage: `linear-gradient(100deg, rgba(5, 20, 40, 0.97) 4%, rgba(5, 20, 40, ${compact ? "0.78" : "0.88"}) 45%, rgba(5, 20, 40, 0.06) 85%), url("${imageUrl}")` }}
    >
      <div className={compact ? "flex min-h-[190px] flex-col items-start p-4 sm:p-5" : "space-y-2 p-5 sm:p-6"}>{children}</div>
    </article>
  );
}
