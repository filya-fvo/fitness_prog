import type { HTMLAttributes, PropsWithChildren } from "react";

import { joinClassNames, statusClass, type StatusNoticeTone } from "@/theme/visualStyles";

type StatusNoticeProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  tone?: StatusNoticeTone;
};

export function StatusNotice({ children, className, tone = "info", ...props }: StatusNoticeProps) {
  return (
    <div {...props} className={joinClassNames(statusClass(tone), className)}>
      {children}
    </div>
  );
}
