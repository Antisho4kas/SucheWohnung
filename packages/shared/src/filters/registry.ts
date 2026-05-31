import type { FilterDefinition } from "./types.js";
import { BOOLEAN_ATTRIBUTES } from "../domain/enums.js";

/**
 * Seed filter registry (§10.2 table + §03.2.1).
 * This is the canonical default set seeded into `filter_definitions`.
 * The matching engine never hard-codes these — it reads them at runtime.
 */

const booleanFilters: FilterDefinition[] = BOOLEAN_ATTRIBUTES.map((key) => ({
  key,
  label: { de: key, en: key, ru: key },
  dataType: "bool",
  operatorSet: ["eq"],
  binding: { attribute: key },
}));

export const SEED_FILTER_DEFINITIONS: FilterDefinition[] = [
  {
    key: "city",
    label: { de: "Stadt", en: "City", ru: "Город" },
    dataType: "text",
    operatorSet: ["eq", "in"],
    binding: { column: "city" },
  },
  {
    key: "bundesland",
    label: { de: "Bundesland", en: "State", ru: "Земля" },
    dataType: "enum",
    operatorSet: ["eq", "in"],
    binding: { column: "bundesland" },
  },
  {
    key: "postal_code",
    label: { de: "PLZ", en: "Postal code", ru: "Индекс" },
    dataType: "text",
    operatorSet: ["eq", "in"],
    binding: { column: "postalCode" },
  },
  {
    key: "location",
    label: { de: "Umkreis", en: "Radius", ru: "Радиус" },
    dataType: "geo",
    operatorSet: ["within"],
    binding: { column: "geo" },
  },
  {
    key: "price",
    label: { de: "Preis", en: "Price", ru: "Цена" },
    dataType: "number",
    operatorSet: ["gte", "lte"],
    binding: { column: "price" },
    config: { unit: "EUR" },
  },
  {
    key: "area",
    label: { de: "Fläche", en: "Area", ru: "Площадь" },
    dataType: "number",
    operatorSet: ["gte", "lte"],
    binding: { column: "area" },
    config: { unit: "m2" },
  },
  {
    key: "rooms",
    label: { de: "Zimmer", en: "Rooms", ru: "Комнаты" },
    dataType: "number",
    operatorSet: ["gte", "lte"],
    binding: { column: "rooms" },
  },
  ...booleanFilters,
];

/** Build an index for O(1) lookup by key. */
export function buildFilterIndex(
  defs: readonly FilterDefinition[],
): ReadonlyMap<string, FilterDefinition> {
  return new Map(defs.map((d) => [d.key, d]));
}
