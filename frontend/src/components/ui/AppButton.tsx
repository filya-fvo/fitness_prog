import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { buttonClass, joinClassNames, type AppButtonTone } from "@/theme/visualStyles";

type AppButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  tone?: AppButtonTone;
};

export function AppButton({ children, className, tone = "primary", type = "button", ...props }: AppButtonProps) {
  return (
    <button {...props} type={type} className={joinClassNames(buttonClass(tone), className)}>
      {children}
    </button>
  );
}
