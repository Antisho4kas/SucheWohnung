"use client";

import React, { useState, type FormEvent } from "react";
import { BedDouble, Check, Euro, MapPin, Maximize, Save } from "lucide-react";
import {
  buildFilters,
  getFilterLabel,
  type FilterDefinition,
  type FilterInput,
  type ProfileFilterFormValues,
} from "../lib/api";
import { useLocale } from "../lib/i18n";
import { cityFromPlz, geoFromPlz } from "../lib/plz-data";

export interface ProfileFormSubmitPayload {
  name: string;
  notify: boolean;
  autoReplyEnabled: boolean;
  autoReplyText: string;
  filters: FilterInput[];
  values: ProfileFilterFormValues;
}

interface ProfileFormProps {
  filterDefinitions: FilterDefinition[];
  initialName?: string;
  initialNotify?: boolean;
  initialAutoReplyEnabled?: boolean;
  initialAutoReplyText?: string;
  initialValues?: ProfileFilterFormValues;
  loading?: boolean;
  submitText?: string;
  onSubmit: (payload: ProfileFormSubmitPayload) => Promise<void> | void;
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function isEnabled(def: FilterDefinition): boolean {
  return def.is_active && def.operator_set.length > 0;
}

function hasOperator(def: FilterDefinition, operator: string): boolean {
  return def.operator_set.includes(operator as never);
}

function readValidation(def: FilterDefinition): Record<string, unknown> {
  const validation = def.config.validation;
  return validation &&
    typeof validation === "object" &&
    !Array.isArray(validation)
    ? (validation as Record<string, unknown>)
    : def.config;
}

function numericInputProps(def: FilterDefinition) {
  const validation = readValidation(def);
  return {
    min: validation.min == null ? undefined : Number(validation.min),
    max: validation.max == null ? undefined : Number(validation.max),
    step: def.key === "rooms" ? 0.5 : 1,
  };
}

function inputModeFor(def: FilterDefinition): "text" | "decimal" {
  return def.data_type === "number" || def.data_type === "range"
    ? "decimal"
    : "text";
}

function hasIncompleteGeo(values: ProfileFilterFormValues): boolean {
  const hasLat = stringifyValue(values.lat) !== "";
  const hasLng = stringifyValue(values.lng) !== "";
  const hasRadius = stringifyValue(values.radius_km) !== "";
  const filled = [hasLat, hasLng, hasRadius].filter(Boolean).length;
  return filled > 0 && filled < 3;
}

export function ProfileForm({
  filterDefinitions,
  initialName = "",
  initialNotify = true,
  initialAutoReplyEnabled = false,
  initialAutoReplyText = "",
  initialValues = {},
  loading = false,
  submitText,
  onSubmit,
}: ProfileFormProps) {
  const { locale, t } = useLocale();
  const [name, setName] = useState(initialName);
  const [notify, setNotify] = useState(initialNotify);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(
    initialAutoReplyEnabled,
  );
  const [autoReplyText, setAutoReplyText] = useState(initialAutoReplyText);
  const [values, setValues] = useState<ProfileFilterFormValues>(initialValues);
  const [error, setError] = useState("");

  const activeDefinitions = filterDefinitions.filter(isEnabled);
  const textDefinitions = activeDefinitions.filter(
    (def) => def.data_type === "text" || def.data_type === "enum",
  );
  const numericDefinitions = activeDefinitions.filter(
    (def) => def.data_type === "number" || def.data_type === "range",
  );
  const geoDefinitions = activeDefinitions.filter(
    (def) => def.data_type === "geo",
  );
  const boolDefinitions = activeDefinitions.filter(
    (def) => def.data_type === "bool",
  );

  const updateValue = (key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  // Fill the geo search center (city + Lat/Lng) from a postal code. The center
  // coordinates always follow the PLZ; the radius is left untouched unless empty,
  // in which case it defaults to 10 km so the geo filter is immediately valid.
  const applyPlzLocation = (
    next: ProfileFilterFormValues,
    plz: string,
    overwriteCity: boolean,
  ): void => {
    const city = cityFromPlz(plz);
    if (city && (overwriteCity || !next.city)) {
      next.city = city;
    }
    const geo = geoFromPlz(plz);
    if (geo) {
      next.lat = geo.lat;
      next.lng = geo.lng;
      if (stringifyValue(next.radius_km) === "") {
        next.radius_km = 10;
      }
    }
  };

  const updatePostalCode = (key: string, value: string) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (value.length === 5) {
        applyPlzLocation(next, value, false);
      }
      return next;
    });
  };

  const applyPlzToCityAndGeo = (plz: string) => {
    setValues((current) => {
      const next = { ...current };
      applyPlzLocation(next, plz, true);
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError(t("profile.nameRequired"));
      return;
    }

    try {
      if (geoDefinitions.length > 0 && hasIncompleteGeo(values)) {
        setError(t("profile.radiusIncomplete"));
        return;
      }
      const filters = buildFilters(values, activeDefinitions);
      if (filters.length === 0) {
        setError(t("profile.filtersRequired"));
        return;
      }
      await onSubmit({
        name: name.trim(),
        notify,
        autoReplyEnabled,
        autoReplyText,
        filters,
        values,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("profile.validationError"),
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card space-y-5">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <MapPin size={20} className="text-primary" />
          {t("profile.name")}
          <span className="text-red-400">*</span>
        </h3>

        <div className="form-group">
          <label htmlFor="name">
            {t("profile.name")} <span className="text-red-400">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("profile.namePlaceholder")}
            required
          />
        </div>

        {textDefinitions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {textDefinitions.map((def) => {
              const label = getFilterLabel(def, locale);
              const value = stringifyValue(values[def.key]);
              const isPostalCode = def.key === "postal_code";
              return (
                <div key={def.key} className="form-group">
                  <label htmlFor={`filter-${def.key}`}>{label}</label>
                  <input
                    id={`filter-${def.key}`}
                    type="text"
                    inputMode={inputModeFor(def)}
                    value={value}
                    onChange={(event) =>
                      isPostalCode
                        ? updatePostalCode(def.key, event.target.value)
                        : updateValue(def.key, event.target.value)
                    }
                    placeholder={label}
                    maxLength={isPostalCode ? 5 : undefined}
                  />
                  {isPostalCode &&
                    value.length === 5 &&
                    cityFromPlz(value) &&
                    !values.city && (
                      <button
                        type="button"
                        onClick={() => applyPlzToCityAndGeo(value)}
                        className="text-xs text-primary mt-1 font-semibold hover:underline"
                      >
                        {t("profile.autoCity")}: {cityFromPlz(value)}
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        )}

        {geoDefinitions.map((def) => {
          const label = getFilterLabel(def, locale);
          const geoCenterCity = cityFromPlz(stringifyValue(values.postal_code));
          const hasCoordinates =
            stringifyValue(values.lat) !== "" &&
            stringifyValue(values.lng) !== "";
          return (
            <div key={def.key} className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {label}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("profile.geoHint")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="form-group">
                  <label htmlFor={`filter-${def.key}-lat`}>Lat</label>
                  <input
                    id={`filter-${def.key}-lat`}
                    type="number"
                    inputMode="decimal"
                    value={stringifyValue(values.lat)}
                    onChange={(event) => updateValue("lat", event.target.value)}
                    placeholder="52.52"
                    step="any"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`filter-${def.key}-lng`}>Lng</label>
                  <input
                    id={`filter-${def.key}-lng`}
                    type="number"
                    inputMode="decimal"
                    value={stringifyValue(values.lng)}
                    onChange={(event) => updateValue("lng", event.target.value)}
                    placeholder="13.405"
                    step="any"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`filter-${def.key}-radius`}>
                    {t("profile.radius")}
                  </label>
                  <input
                    id={`filter-${def.key}-radius`}
                    type="number"
                    inputMode="decimal"
                    value={stringifyValue(values.radius_km)}
                    onChange={(event) =>
                      updateValue("radius_km", event.target.value)
                    }
                    placeholder={t("profile.radiusPlaceholder")}
                    min={0}
                    step="any"
                  />
                </div>
              </div>
              {hasCoordinates && geoCenterCity && (
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t("profile.geoCenter")}: {geoCenterCity}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {numericDefinitions.length > 0 && (
        <div className="card space-y-5">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Euro size={20} className="text-primary" />
            {t("profile.numericFilters")}
          </h3>
          {numericDefinitions.map((def) => {
            const label = getFilterLabel(def, locale);
            const props = numericInputProps(def);
            return (
              <div key={def.key} className="space-y-2">
                <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                  {def.key === "area" ? (
                    <Maximize size={18} className="text-primary" />
                  ) : def.key === "rooms" ? (
                    <BedDouble size={18} className="text-primary" />
                  ) : null}
                  {label}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {hasOperator(def, "gte") && (
                    <div className="form-group">
                      <label htmlFor={`filter-${def.key}-min`}>
                        {t("common.min")}
                      </label>
                      <input
                        id={`filter-${def.key}-min`}
                        type="number"
                        inputMode="decimal"
                        value={stringifyValue(values[`${def.key}_min`])}
                        onChange={(event) =>
                          updateValue(`${def.key}_min`, event.target.value)
                        }
                        placeholder={t("common.min")}
                        {...props}
                      />
                    </div>
                  )}
                  {hasOperator(def, "lte") && (
                    <div className="form-group">
                      <label htmlFor={`filter-${def.key}-max`}>
                        {t("common.max")}
                      </label>
                      <input
                        id={`filter-${def.key}-max`}
                        type="number"
                        inputMode="decimal"
                        value={stringifyValue(values[`${def.key}_max`])}
                        onChange={(event) =>
                          updateValue(`${def.key}_max`, event.target.value)
                        }
                        placeholder={t("common.max")}
                        {...props}
                      />
                    </div>
                  )}
                  {hasOperator(def, "eq") && (
                    <div className="form-group">
                      <label htmlFor={`filter-${def.key}-eq`}>{label}</label>
                      <input
                        id={`filter-${def.key}-eq`}
                        type="number"
                        inputMode="decimal"
                        value={stringifyValue(values[def.key])}
                        onChange={(event) =>
                          updateValue(def.key, event.target.value)
                        }
                        placeholder={label}
                        {...props}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {boolDefinitions.length > 0 && (
        <div className="card space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Check size={20} className="text-primary" />
            {t("profile.amenities")}
          </h3>
          {boolDefinitions.map((def) => (
            <label
              key={def.key}
              className="flex items-center justify-between cursor-pointer py-2.5 px-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {getFilterLabel(def, locale)}
              </span>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={values[def.key] === true}
                  onChange={(event) =>
                    updateValue(def.key, event.target.checked)
                  }
                />
                <span className="toggle-slider" />
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="card">
        <label className="flex items-center justify-between cursor-pointer py-2.5 px-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("profile.notify")}
          </span>
          <span className="toggle-switch">
            <input
              type="checkbox"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
            />
            <span className="toggle-slider" />
          </span>
        </label>
      </div>

      <div className="card space-y-4">
        <label className="flex items-center justify-between cursor-pointer py-2.5 px-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("profile.autoReply")}
          </span>
          <span className="toggle-switch">
            <input
              type="checkbox"
              checked={autoReplyEnabled}
              onChange={(event) => setAutoReplyEnabled(event.target.checked)}
            />
            <span className="toggle-slider" />
          </span>
        </label>
        {autoReplyEnabled && (
          <div className="form-group">
            <label htmlFor="auto-reply-text">{t("profile.autoReply")}</label>
            <textarea
              id="auto-reply-text"
              value={autoReplyText}
              onChange={(event) => setAutoReplyText(event.target.value)}
              placeholder={t("profile.autoReplyPlaceholder")}
              maxLength={1000}
              rows={4}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("profile.autoReplyHint")}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary w-full"
      >
        <Save size={18} />{" "}
        {loading
          ? t("profile.submitting")
          : (submitText ?? t("profile.submit"))}
      </button>
    </form>
  );
}
