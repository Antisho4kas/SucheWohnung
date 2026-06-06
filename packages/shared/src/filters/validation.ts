import type { ProfileFilter } from "./types.js";

export interface FilterValidationDefinition {
  readonly key: string;
  readonly dataType: string;
  readonly operatorSet: readonly string[];
  readonly config?: unknown;
  readonly isActive?: boolean;
}

export interface FilterValidationError {
  readonly field: string;
  readonly issue: string;
}

export type FilterValidationResult =
  | { readonly success: true; readonly filters: readonly ProfileFilter[] }
  | {
      readonly success: false;
      readonly errors: readonly FilterValidationError[];
    };

const RANGE_KEYS = new Set(["price", "area", "rooms"]);
const NUMERIC_OPERATORS = new Set(["eq", "gte", "lte"]);
const SCALAR_OPERATORS = new Set(["eq"]);
const ARRAY_OPERATORS = new Set(["in"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readConfig(def: FilterValidationDefinition): Record<string, unknown> {
  return isRecord(def.config) ? def.config : {};
}

function readValidationConfig(
  def: FilterValidationDefinition,
): Record<string, unknown> {
  const config = readConfig(def);
  return isRecord(config.validation) ? config.validation : config;
}

function readConfigNumber(
  config: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readAllowedValues(
  def: FilterValidationDefinition,
): readonly string[] | undefined {
  const config = readConfig(def);
  const validation = readValidationConfig(def);
  const candidates = [
    validation.values,
    validation.allowedValues,
    validation.allowed_values,
    validation.options,
    config.values,
    config.allowedValues,
    config.allowed_values,
    config.options,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const values = candidate
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.value === "string") return item.value;
        return undefined;
      })
      .filter((item): item is string => item !== undefined);
    if (values.length > 0) return values;
  }
  return undefined;
}

function add(
  errors: FilterValidationError[],
  field: string,
  issue: string,
): void {
  errors.push({ field, issue });
}

function assertOperatorCompatible(
  errors: FilterValidationError[],
  field: string,
  dataType: string,
  operator: string,
): boolean {
  if (
    (dataType === "number" || dataType === "range") &&
    (NUMERIC_OPERATORS.has(operator) || ARRAY_OPERATORS.has(operator))
  ) {
    return true;
  }
  if (
    (dataType === "text" || dataType === "string" || dataType === "enum") &&
    (SCALAR_OPERATORS.has(operator) || ARRAY_OPERATORS.has(operator))
  ) {
    return true;
  }
  if (
    (dataType === "bool" || dataType === "boolean") &&
    (SCALAR_OPERATORS.has(operator) || ARRAY_OPERATORS.has(operator))
  ) {
    return true;
  }
  if (
    (dataType === "geo" || dataType === "location") &&
    operator === "within"
  ) {
    return true;
  }

  add(errors, field, "operator is not compatible with this filter data type");
  return false;
}

function assertNumber(
  errors: FilterValidationError[],
  field: string,
  value: unknown,
  def: FilterValidationDefinition,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    add(errors, field, "must be a finite number");
    return false;
  }

  const validation = readValidationConfig(def);
  const min = readConfigNumber(validation, ["min", "minValue", "min_value"]);
  const max = readConfigNumber(validation, ["max", "maxValue", "max_value"]);
  if (min !== undefined && value < min) {
    add(errors, field, `must be >= ${min}`);
    return false;
  }
  if (max !== undefined && value > max) {
    add(errors, field, `must be <= ${max}`);
    return false;
  }
  return true;
}

function assertBoolean(
  errors: FilterValidationError[],
  field: string,
  value: unknown,
): value is boolean {
  if (typeof value !== "boolean") {
    add(errors, field, "must be a boolean");
    return false;
  }
  return true;
}

function assertString(
  errors: FilterValidationError[],
  field: string,
  value: unknown,
  def: FilterValidationDefinition,
): value is string {
  if (typeof value !== "string") {
    add(errors, field, "must be a string");
    return false;
  }

  const trimmedLength = value.trim().length;
  if (trimmedLength === 0) {
    add(errors, field, "must be a non-empty string");
    return false;
  }

  const validation = readValidationConfig(def);
  const minLength = readConfigNumber(validation, [
    "minLength",
    "min_length",
    "min",
  ]);
  const maxLength = readConfigNumber(validation, [
    "maxLength",
    "max_length",
    "max",
  ]);
  if (minLength !== undefined && trimmedLength < minLength) {
    add(errors, field, `length must be >= ${minLength}`);
    return false;
  }
  if (maxLength !== undefined && trimmedLength > maxLength) {
    add(errors, field, `length must be <= ${maxLength}`);
    return false;
  }
  return true;
}

function assertEnum(
  errors: FilterValidationError[],
  field: string,
  value: unknown,
  def: FilterValidationDefinition,
): value is string {
  if (!assertString(errors, field, value, def)) return false;
  const allowed = readAllowedValues(def);
  if (allowed && !allowed.includes(value)) {
    add(errors, field, `must be one of: ${allowed.join(", ")}`);
    return false;
  }
  return true;
}

function assertArray(
  errors: FilterValidationError[],
  field: string,
  value: unknown,
): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    add(errors, field, "must be a non-empty array");
    return false;
  }
  if (value.length === 0) {
    add(errors, field, "must be a non-empty array");
    return false;
  }
  return true;
}

function assertLocation(
  errors: FilterValidationError[],
  field: string,
  value: unknown,
  def: FilterValidationDefinition,
): boolean {
  if (!isRecord(value)) {
    add(errors, field, "must be an object with lat, lng, and radius_km");
    return false;
  }

  const latOk = assertNumber(errors, `${field}.lat`, value.lat, {
    ...def,
    config: { validation: { min: -90, max: 90 } },
  });
  const lngOk = assertNumber(errors, `${field}.lng`, value.lng, {
    ...def,
    config: { validation: { min: -180, max: 180 } },
  });
  const radiusOk = assertNumber(errors, `${field}.radius_km`, value.radius_km, {
    ...def,
    config: {
      validation: {
        min:
          readConfigNumber(readValidationConfig(def), [
            "minRadiusKm",
            "min_radius_km",
            "radiusMinKm",
            "radius_min_km",
          ]) ?? 0,
        max: readConfigNumber(readValidationConfig(def), [
          "maxRadiusKm",
          "max_radius_km",
          "radiusMaxKm",
          "radius_max_km",
        ]),
      },
    },
  });

  if (radiusOk && typeof value.radius_km === "number" && value.radius_km <= 0) {
    add(errors, `${field}.radius_km`, "must be > 0");
    return false;
  }

  return latOk && lngOk && radiusOk;
}

function validateValue(
  errors: FilterValidationError[],
  field: string,
  def: FilterValidationDefinition,
  operator: string,
  value: unknown,
): boolean {
  const dataType = def.dataType;
  if (
    !assertOperatorCompatible(errors, `${field}.operator`, dataType, operator)
  ) {
    return false;
  }

  if (dataType === "number" || dataType === "range") {
    if (operator === "in") {
      return (
        assertArray(errors, `${field}.value`, value) &&
        value.every((item, itemIndex) =>
          assertNumber(errors, `${field}.value[${itemIndex}]`, item, def),
        )
      );
    }
    return assertNumber(errors, `${field}.value`, value, def);
  }

  if (dataType === "bool" || dataType === "boolean") {
    if (operator === "in") {
      return (
        assertArray(errors, `${field}.value`, value) &&
        value.every((item, itemIndex) =>
          assertBoolean(errors, `${field}.value[${itemIndex}]`, item),
        )
      );
    }
    return assertBoolean(errors, `${field}.value`, value);
  }

  if (dataType === "enum") {
    if (operator === "in") {
      return (
        assertArray(errors, `${field}.value`, value) &&
        value.every((item, itemIndex) =>
          assertEnum(errors, `${field}.value[${itemIndex}]`, item, def),
        )
      );
    }
    return assertEnum(errors, `${field}.value`, value, def);
  }

  if (dataType === "text" || dataType === "string") {
    if (operator === "in") {
      return (
        assertArray(errors, `${field}.value`, value) &&
        value.every((item, itemIndex) =>
          assertString(errors, `${field}.value[${itemIndex}]`, item, def),
        )
      );
    }
    return assertString(errors, `${field}.value`, value, def);
  }

  if (dataType === "geo" || dataType === "location") {
    return assertLocation(errors, `${field}.value`, value, def);
  }

  add(errors, `${field}.data_type`, "unsupported filter data type");
  return false;
}

export function validateProfileFilters(
  filters: readonly ProfileFilter[],
  definitions: readonly FilterValidationDefinition[],
): FilterValidationResult {
  const errors: FilterValidationError[] = [];
  const byKey = new Map(
    definitions
      .filter((def) => def.isActive !== false)
      .map((def) => [def.key, def]),
  );
  const rangeValues = new Map<string, Partial<Record<"gte" | "lte", number>>>();

  filters.forEach((filter, index) => {
    const field = `filters[${index}]`;
    const def = byKey.get(filter.key);
    if (!def) {
      add(errors, `${field}.key`, "unknown filter key");
      return;
    }

    if (!def.operatorSet.includes(filter.operator)) {
      add(
        errors,
        `${field}.operator`,
        "operator is not allowed for this filter",
      );
      return;
    }

    const valid = validateValue(
      errors,
      field,
      def,
      filter.operator,
      filter.value,
    );

    if (
      valid &&
      RANGE_KEYS.has(filter.key) &&
      (filter.operator === "gte" || filter.operator === "lte") &&
      typeof filter.value === "number" &&
      Number.isFinite(filter.value)
    ) {
      const current = rangeValues.get(filter.key) ?? {};
      rangeValues.set(filter.key, {
        ...current,
        [filter.operator]: filter.value,
      });
    }
  });

  for (const [key, range] of rangeValues) {
    if (
      range.gte !== undefined &&
      range.lte !== undefined &&
      range.gte > range.lte
    ) {
      add(errors, key, "gte must be <= lte");
    }
  }

  if (errors.length > 0) return { success: false, errors };
  return { success: true, filters };
}
