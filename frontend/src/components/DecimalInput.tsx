import {
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type InputHTMLAttributes,
} from "react";

import { normalizeDecimalInput } from "@/components/decimalInputValue";

function isDecimalDraft(raw: string): boolean {
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d*)?$/.test(raw.trim());
}

function displayValue(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(".", ",");
}

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange"
> & {
  value: string | number | null | undefined;
  onValueChange: (normalizedValue: string) => void;
};

/**
 * Decimal input for Russian keyboards and Telegram WebView.
 * Keeps a comma while the user types, but reports a dot-normalized value to calculations.
 */
export function DecimalInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [draft, setDraft] = useState(() => displayValue(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(displayValue(value));
  }, [value]);

  const handleFocus: FocusEventHandler<HTMLInputElement> = (event) => {
    focused.current = true;
    onFocus?.(event);
  };

  const handleBlur: FocusEventHandler<HTMLInputElement> = (event) => {
    focused.current = false;
    const normalized = normalizeDecimalInput(draft);
    const settled = normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
    setDraft(displayValue(settled));
    onValueChange(settled);
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      lang="ru"
      value={draft}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(event) => {
        const next = event.target.value;
        if (!isDecimalDraft(next)) return;
        setDraft(next);
        onValueChange(normalizeDecimalInput(next));
      }}
    />
  );
}
