import type { HTMLAttributes, PropsWithChildren } from "react";

import { chipClass, joinClassNames, type AppChipTone } from "@/theme/visualStyles";

type AppChipProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & {
  tone?: AppChipTone;
};

export function AppChip({ children, className, tone = "neutral", ...props }: AppChipProps) {
  return (
    <span {...props} className={joinClassNames(chipClass(tone), className)}>
      {children}
    </span>
  );
}
