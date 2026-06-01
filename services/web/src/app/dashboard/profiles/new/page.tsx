"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { cityFromPlz } from "@/lib/plz-data";

export default function NewProfilePage() {
  const router = useRouter();
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [radiusKm, setRadiusKm] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [roomsMin, setRoomsMin] = useState("");
  const [balcony, setBalcony] = useState(false);
  const [elevator, setElevator] = useState(false);
  const [parking, setParking] = useState(false);
  const [pets, setPets] = useState(false);
  const [notify, setNotify] = useState(true);

  const handlePlzChange = useCallback((val: string) => {
    setPostalCode(val);
    if (val.length === 5) {
      const found = cityFromPlz(val);
      if (found && !city) setCity(found);
    }
  }, [city]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name) { setError(t("profile.nameRequired")); return; }
    setLoading(true);
    try {
      await api.createProfile({
        name, city: city || undefined, postal_code: postalCode || undefined,
        radius_km: radiusKm ? Number(radiusKm) : undefined,
        price_min: priceMin ? Number(priceMin) : undefined,
        price_max: priceMax ? Number(priceMax) : undefined,
        area_min: areaMin ? Number(areaMin) : undefined,
        area_max: areaMax ? Number(areaMax) : undefined,
        rooms_min: roomsMin ? Number(roomsMin) : undefined,
        balcony, elevator, parking, pets, notify,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("profile.createError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-6">{t("dashboard.profiles.create")}</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card space-y-5">
          <div className="form-group">
            <label htmlFor="name">{t("profile.name")} *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("profile.namePlaceholder")} required />
          </div>
          <div className="form-group">
            <label htmlFor="city">{t("profile.city")}</label>
            <input id="city" type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("profile.cityPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label htmlFor="plz">{t("profile.postalCode")}</label>
              <input id="plz" type="text" value={postalCode} onChange={(e) => handlePlzChange(e.target.value)} placeholder={t("profile.postalCodePlaceholder")} maxLength={5} />
              {postalCode.length === 5 && cityFromPlz(postalCode) && !city && (
                <button type="button" onClick={() => setCity(cityFromPlz(postalCode))} className="text-sm text-primary mt-1 underline">
                  {t("profile.autoCity")}: {cityFromPlz(postalCode)}
                </button>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="radius">{t("profile.radius")}</label>
              <input id="radius" type="number" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} placeholder="5" min={0} max={100} />
            </div>
          </div>
        </div>

        <div className="card space-y-5">
          <h3 className="text-xl font-bold">{t("profile.priceSpan")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label htmlFor="price-min">{t("profile.priceMin")}</label>
              <input id="price-min" type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="0" min={0} />
            </div>
            <div className="form-group">
              <label htmlFor="price-max">{t("profile.priceMax")}</label>
              <input id="price-max" type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="2000" min={0} />
            </div>
          </div>

          <h3 className="text-xl font-bold">{t("profile.areaSpan")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label htmlFor="area-min">{t("profile.areaMin")}</label>
              <input id="area-min" type="number" value={areaMin} onChange={(e) => setAreaMin(e.target.value)} placeholder="20" min={0} />
            </div>
            <div className="form-group">
              <label htmlFor="area-max">{t("profile.areaMax")}</label>
              <input id="area-max" type="number" value={areaMax} onChange={(e) => setAreaMax(e.target.value)} placeholder="100" />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="rooms">{t("profile.roomsMin")}</label>
            <input id="rooms" type="number" value={roomsMin} onChange={(e) => setRoomsMin(e.target.value)} placeholder="1" min={1} step={0.5} />
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="text-xl font-bold">{t("profile.amenities")}</h3>
          {[
            { key: "balcony", label: t("profile.balcony"), value: balcony, set: setBalcony },
            { key: "elevator", label: t("profile.elevator"), value: elevator, set: setElevator },
            { key: "parking", label: t("profile.parking"), value: parking, set: setParking },
            { key: "pets", label: t("profile.pets"), value: pets, set: setPets },
          ].map(({ key, label, value, set }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer text-lg font-medium">
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="w-5 h-5 accent-primary" /> {label}
            </label>
          ))}
        </div>

        <div className="card">
          <label className="flex items-center gap-3 cursor-pointer text-lg font-semibold">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-5 h-5 accent-primary" />
            {t("profile.notify")}
          </label>
        </div>

        {error && <p className="form-error text-base">{error}</p>}

        <button type="submit" disabled={loading} className="btn btn-primary w-full text-xl py-4">
          <Save size={22} /> {loading ? t("profile.submitting") : t("profile.submit")}
        </button>
      </form>
    </div>
  );
}
