import { Link } from "react-router-dom";

type Feature = "coach" | "support" | "faq";
type Props = { to: string; title: string; description: string; action: string; feature: Feature; badge?: string };

const tone: Record<Feature, string> = {
  coach: "from-[#0d3067] via-[#153a88] to-[#0b1b3d]",
  support: "from-[#252063] via-[#2c348c] to-[#0b1b3d]",
  faq: "from-[#311e69] via-[#342b88] to-[#0b1b3d]",
};

function Illustration({ feature }: { feature: Feature }) {
  return (
    <svg data-help-illustration={feature} viewBox="0 0 128 128" aria-hidden="true" className="h-28 w-28 drop-shadow-[0_14px_12px_rgba(0,0,0,.35)]">
      {feature === "coach" ? <>
        <path d="M38 116c3-18 14-25 26-25s23 7 26 25" fill="#6b60db" stroke="#baa7ff" strokeWidth="3" />
        <rect x="18" y="32" width="92" height="69" rx="26" fill="#9186ef" stroke="#c6b8ff" strokeWidth="3" />
        <rect x="28" y="43" width="72" height="47" rx="18" fill="#12295d" />
        <circle cx="48" cy="65" r="7" fill="#78eaff" /><circle cx="80" cy="65" r="7" fill="#78eaff" />
        <path d="M55 79c6 4 12 4 18 0M64 20v12" fill="none" stroke="#c3b8ff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="64" cy="18" r="6" fill="#f75aa5" />
      </> : null}
      {feature === "support" ? <>
        <path d="M20 24h84a17 17 0 0 1 17 17v48a17 17 0 0 1-17 17H58l-25 17v-17H20A17 17 0 0 1 3 89V41a17 17 0 0 1 17-17Z" fill="#8674e7" stroke="#cabaff" strokeWidth="3" />
        <circle cx="37" cy="65" r="7" fill="#ded7ff" /><circle cx="63" cy="65" r="7" fill="#ded7ff" /><circle cx="89" cy="65" r="7" fill="#ded7ff" />
      </> : null}
      {feature === "faq" ? <>
        <rect x="28" y="10" width="80" height="108" rx="13" fill="#8267df" stroke="#d0baff" strokeWidth="3" />
        <path d="M42 11v106" stroke="#4936aa" strokeWidth="6" />
        <rect x="52" y="36" width="44" height="8" rx="4" fill="#e8deff" /><rect x="52" y="57" width="36" height="7" rx="3" fill="#cbbcff" /><rect x="52" y="75" width="43" height="7" rx="3" fill="#cbbcff" />
        <circle cx="88" cy="99" r="14" fill="#4734a9" stroke="#d0baff" strokeWidth="2" />
        <path d="M84 95a4 4 0 1 1 6 3c-2 1-2 2-2 3m0 4h.1" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </> : null}
    </svg>
  );
}

export function HelpFeatureCard({ to, title, description, action, feature, badge }: Props) {
  return (
    <Link to={to} data-help-feature={feature} className={`group relative flex min-h-[186px] overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r ${tone[feature]} p-4 text-white shadow-[0_14px_30px_rgba(1,9,29,.25)] active:scale-[.99]`}>
      <span className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-sky-400/15 blur-2xl" aria-hidden="true" />
      <span className="relative z-10 flex min-w-0 flex-1 flex-col items-start">
        <span className="flex items-center gap-2 text-lg font-bold leading-tight">{title}{badge ? <span className="rounded-full bg-pink-500/80 px-2 py-0.5 text-[10px] font-semibold">{badge}</span> : null}</span>
        <span className="mt-2 max-w-[18rem] text-xs leading-relaxed text-sky-100/85">{description}</span>
        <span className="mt-auto inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-[#ff6b46] via-[#ef438c] to-[#7c4dff] px-4 text-xs font-bold shadow-[0_6px_16px_rgba(207,55,120,.3)]">{action}<span className="ml-2 text-base group-hover:translate-x-0.5" aria-hidden="true">→</span></span>
      </span>
      <span className="relative -mr-4 -mb-4 mt-auto w-28 shrink-0"><Illustration feature={feature} /></span>
    </Link>
  );
}
