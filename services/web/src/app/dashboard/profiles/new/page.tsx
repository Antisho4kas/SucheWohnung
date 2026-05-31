"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export default function NewProfilePage() {
  const router = useRouter();
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [roomsMin, setRoomsMin] = useState("");
  const [balcony, setBalcony] = useState(false);
  const [elevator, setElevator] = useState(false);
  const [parking, setParking] = useState(false);
  const [pets, setPets] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.createProfile({
        name,
        city,
        price_min: priceMin ? Number(priceMin) : undefined,
        price_max: priceMax ? Number(priceMax) : undefined,
        area_min: areaMin ? Number(areaMin) : undefined,
        area_max: areaMax ? Number(areaMax) : undefined,
        rooms_min: roomsMin ? Number(roomsMin) : undefined,
        balcony,
        elevator,
        parking,
        pets,
        notify: notificationsEnabled,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : t("profile.createError"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-6">
        {t("dashboard.profiles.create")}
      </h1>

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div className="form-group">
          <label htmlFor="name">{t("profile.name")}</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Berlin Mitte 2-Zimmer"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="city">{t("profile.city")}</label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="z.B. Berlin"
            required
          />
        </div>

        <fieldset className="form-group">
          <legend className="label font-semibold text-lg mb-2">
            {t("profile.priceSpan")}
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="price-min" className="text-base font-medium">
                {t("common.min")}
              </label>
              <input
                id="price-min"
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="0"
                min={0}
              />
            </div>
            <div>
              <label htmlFor="price-max" className="text-base font-medium">
                {t("common.max")}
              </label>
              <input
                id="price-max"
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="z.B. 1500"
                min={0}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="form-group">
          <legend className="label font-semibold text-lg mb-2">
            {t("profile.areaSpan")}
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="area-min" className="text-base font-medium">
                {t("common.min")}
              </label>
              <input
                id="area-min"
                type="number"
                value={areaMin}
                onChange={(e) => setAreaMin(e.target.value)}
                placeholder="z.B. 40"
                min={0}
              />
            </div>
            <div>
              <label htmlFor="area-max" className="text-base font-medium">
                {t("common.max")}
              </label>
              <input
                id="area-max"
                type="number"
                value={areaMax}
                onChange={(e) => setAreaMax(e.target.value)}
                placeholder="z.B. 100"
                min={0}
              />
            </div>
          </div>
        </fieldset>

        <div className="form-group">
          <label htmlFor="rooms-min">{t("profile.roomsMin")}</label>
          <input
            id="rooms-min"
            type="number"
            value={roomsMin}
            onChange={(e) => setRoomsMin(e.target.value)}
            placeholder="z.B. 2"
            min={1}
            step={0.5}
          />
        </div>

        <fieldset className="form-group">
          <legend className="label font-semibold text-lg mb-2">
            {t("profile.amenities")}
          </legend>
          <div className="space-y-3">
            {[
              { key: "balcony", label: t("profile.balcony"), value: balcony, setter: setBalcony },
              { key: "elevator", label: t("profile.elevator"), value: elevator, setter: setElevator },
              { key: "parking", label: t("profile.parkingLabel"), value: parking, setter: setParking },
              { key: "pets", label: t("profile.pets"), value: pets, setter: setPets },
            ].map(({ key, label, value, setter }) => (
              <label
                key={key}
                className="flex items-center gap-3 cursor-pointer text-lg font-normal"
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setter(e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-group">
          <label className="flex items-center gap-3 cursor-pointer text-lg">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="w-5 h-5 accent-primary"
            />
            {t("profile.notify")}
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary w-full text-xl py-4"
          disabled={loading}
        >
          <Save size={22} />
          {loading ? t("profile.submitting") : t("profile.submit")}
        </button>
      </form>
    </div>
  );
}
