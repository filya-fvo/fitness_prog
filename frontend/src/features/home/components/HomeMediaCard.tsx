import type { ReactNode } from "react";

type HomeMediaCardProps = {
  children: ReactNode;
  imageUrl: string;
};

export function HomeMediaCard({ children, imageUrl }: HomeMediaCardProps) {
  return (
    <article className="home-media-card media-card min-w-0 overflow-hidden">
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[65%_center]"
        loading="eager"
        decoding="async"
      />
      <div className="relative z-10 space-y-2 p-5 sm:p-6">{children}</div>
    </article>
  );
}
