import type { HTMLAttributes, PropsWithChildren } from "react";

import { cardClass, joinClassNames, type AppCardTone } from "@/theme/visualStyles";

type AppCardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  tone?: AppCardTone;
};

export function AppCard({ children, className, tone = "neutral", ...props }: AppCardProps) {
  return (
    <div {...props} className={joinClassNames(cardClass(tone), className)}>
      {children}
    </div>
  );
}
