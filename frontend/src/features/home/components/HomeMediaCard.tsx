import type { ReactNode } from "react";

type HomeMediaCardProps = {
  children: ReactNode;
  imageUrl: string;
};

export function HomeMediaCard({ children, imageUrl }: HomeMediaCardProps) {
  return (
    <article
      className="home-media-card media-card min-w-0 overflow-hidden"
      style={{ backgroundImage: `linear-gradient(100deg, rgba(4, 10, 8, 0.96) 4%, rgba(4, 10, 8, 0.78) 58%, rgba(4, 10, 8, 0.28)), url("${imageUrl}")` }}
    >
      <div className="space-y-2 p-5 sm:p-6">{children}</div>
    </article>
  );
}
