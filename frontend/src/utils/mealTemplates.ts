/**
 * Quick meal templates for nutrition diary (UX P2).
 * Macros are approximate per 100g product rows already in catalog search —
 * templates only prefill search + grams + meal, user confirms.
 */

export type MealTemplate = {
  id: string;
  label: string;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  /** Search query to pick first catalog hit */
  query: string;
  grams: number;
  blurb: string;
};

export const MEAL_TEMPLATES: MealTemplate[] = [
  {
    id: "bf_oats",
    label: "Завтрак ~400 ккал",
    meal: "breakfast",
    query: "Овсянка на воде",
    grams: 250,
    blurb: "Овсянка 250 г",
  },
  {
    id: "bf_eggs",
    label: "Яичница",
    meal: "breakfast",
    query: "Яйцо куриное",
    grams: 120,
    blurb: "Яйца ~2 шт",
  },
  {
    id: "ln_chicken",
    label: "Обед: курица+рис",
    meal: "lunch",
    query: "Куриная грудка",
    grams: 150,
    blurb: "Грудка 150 г (рис добавьте отдельно)",
  },
  {
    id: "dn_fish",
    label: "Ужин: рыба",
    meal: "dinner",
    query: "Треска",
    grams: 180,
    blurb: "Рыба 180 г",
  },
  {
    id: "sn_protein",
    label: "Перекус: творог",
    meal: "snack",
    query: "Творог",
    grams: 150,
    blurb: "Творог 150 г",
  },
  {
    id: "sn_banana",
    label: "Банан",
    meal: "snack",
    query: "Банан",
    grams: 120,
    blurb: "Банан ~1 шт",
  },
];
