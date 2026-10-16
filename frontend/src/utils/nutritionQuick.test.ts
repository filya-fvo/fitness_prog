import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearNutritionShortcuts, loadFavoriteProducts, loadRecentProducts, rememberRecentProduct, toggleFavoriteProduct,
} from "./nutritionQuick";

const ownerA = "22222222-2222-4222-8222-222222222222";
const ownerB = "99999999-9999-4999-8999-999999999999";
const product = { id: "33333333-3333-4333-8333-333333333333", name_ru: "Мой йогурт",
  calories: 125, proteins: 7, fats: 3, carbs: 10, category: "custom" };
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps portions and personal macros private to the account that saved them", () => {
  rememberRecentProduct(product, { grams: 137, mealType: "dinner" }, ownerA);
  toggleFavoriteProduct(product, ownerA);
  expect(loadRecentProducts(ownerB)).toEqual([]);
  expect(loadFavoriteProducts(ownerB)).toEqual([]);
  expect(loadRecentProducts(ownerA)).toEqual([{ ...product, lastGrams: 137, lastMeal: "dinner" }]);
  expect(loadFavoriteProducts(ownerA)).toEqual([product]);
});

it("changing another account's copy of the same product preserves the original shortcuts", () => {
  rememberRecentProduct(product, { grams: 137 }, ownerA);
  toggleFavoriteProduct(product, ownerA);
  const other = { ...product, calories: 80 };
  rememberRecentProduct(other, { grams: 100 }, ownerB);
  expect(toggleFavoriteProduct(other, ownerB).added).toBe(true);
  expect(loadFavoriteProducts(ownerB)).toEqual([other]);
  expect(toggleFavoriteProduct(other, ownerB).added).toBe(false);
  expect(loadFavoriteProducts(ownerA)).toEqual([product]);
  expect(loadRecentProducts(ownerA)[0]).toMatchObject({ calories: 125, lastGrams: 137 });
});

it("does not read or write account shortcuts while no owner is known", () => {
  rememberRecentProduct(product, { grams: 137 }, ownerA);
  toggleFavoriteProduct(product, ownerA);
  const before = [...storage.entries()];
  expect(loadRecentProducts(undefined)).toEqual([]);
  expect(loadFavoriteProducts(undefined)).toEqual([]);
  expect(rememberRecentProduct(product, { grams: 100 }, undefined)).toEqual([]);
  expect(toggleFavoriteProduct(product, undefined)).toEqual({ favorites: [], added: false });
  expect([...storage.entries()]).toEqual(before);
});

it("preserves legacy unowned lists without assigning them to an arbitrary login", () => {
  const legacy = JSON.stringify([product]);
  storage.set("fitness_nutrition_recent_v1", legacy);
  storage.set("fitness_nutrition_favorites_v1", legacy);
  expect(loadRecentProducts(ownerA)).toEqual([]);
  expect(loadFavoriteProducts(ownerB)).toEqual([]);
  expect(storage.get("fitness_nutrition_recent_v1")).toBe(legacy);
  expect(storage.get("fitness_nutrition_favorites_v1")).toBe(legacy);
});

it("clearing one account's shortcuts preserves the other account", () => {
  for (const owner of [ownerA, ownerB]) {
    rememberRecentProduct(product, { grams: 137 }, owner);
    toggleFavoriteProduct(product, owner);
  }
  clearNutritionShortcuts(ownerA);
  expect(loadRecentProducts(ownerA)).toEqual([]);
  expect(loadFavoriteProducts(ownerA)).toEqual([]);
  expect(loadRecentProducts(ownerB)[0]).toMatchObject({ lastGrams: 137 });
  expect(loadFavoriteProducts(ownerB)).toEqual([product]);
});
