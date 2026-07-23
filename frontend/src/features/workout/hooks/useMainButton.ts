import { useEffect } from "react";

import { getTelegramWebApp } from "@/lib/telegram";

type UseMainButtonOptions = {
  text: string;
  visible: boolean;
  enabled?: boolean;
  onClick: () => void;
};

/** Bind Telegram MainButton for key workout actions (TZ §7). */
export function useMainButton({ text, visible, enabled = true, onClick }: UseMainButtonOptions) {
  useEffect(() => {
    const mainButton = getTelegramWebApp()?.MainButton;
    if (!mainButton) {
      return;
    }

    const handler = () => onClick();
    mainButton.setText(text);
    mainButton.onClick(handler);

    if (visible) {
      mainButton.show();
    } else {
      mainButton.hide();
    }

    if (enabled) {
      mainButton.enable();
    } else {
      mainButton.disable();
    }

    return () => {
      mainButton.offClick(handler);
      mainButton.hide();
    };
  }, [enabled, onClick, text, visible]);
}
