"use client";

import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "@/app/journey/journey.module.css";

type WeatherResponse = {
  current?: {
    temperature_2m: number;
    weather_code: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
};

type WeatherView = {
  code: number;
  temperature: number;
  secondaryTemperature?: number;
  isTripForecast: boolean;
};

const weatherCache = new Map<string, WeatherResponse>();
const WEATHER_TIMEOUT_MS = 6_000;

function getTripDate(dateLabel: string) {
  const day = dateLabel.match(/\d+/)?.[0];
  return day ? `2027-03-${day.padStart(2, "0")}` : undefined;
}

function getCondition(code: number) {
  if (code === 0) return { label: "Clear", Icon: Sun };
  if (code <= 3) return { label: code === 1 ? "Mostly clear" : "Cloudy", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Fog", Icon: CloudFog };
  if (code >= 71 && code <= 77) return { label: "Snow", Icon: CloudSnow };
  if (code >= 95) return { label: "Storms", Icon: CloudLightning };
  return { label: "Rain", Icon: CloudRain };
}

export function JourneyWeather({ city, coordinates, date }: { city: string; coordinates: [number, number]; date: string }) {
  const [weather, setWeather] = useState<WeatherResponse>();
  const [failed, setFailed] = useState(false);
  const [longitude, latitude] = coordinates;
  const cacheKey = `${latitude},${longitude}`;
  const targetDate = getTripDate(date);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort(new DOMException("Weather request timed out", "TimeoutError"));
    }, WEATHER_TIMEOUT_MS);
    setFailed(false);

    const cached = weatherCache.get(cacheKey);
    if (cached) {
      window.clearTimeout(timeout);
      setWeather(cached);
      return () => { active = false; controller.abort(); };
    }

    setWeather(undefined);
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min",
      forecast_days: "16",
      timezone: "auto",
    });

    fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Weather request failed");
        return response.json() as Promise<WeatherResponse>;
      })
      .then((data) => {
        weatherCache.set(cacheKey, data);
        if (active) setWeather(data);
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cacheKey, latitude, longitude]);

  const view = useMemo<WeatherView | undefined>(() => {
    const forecastIndex = targetDate && weather?.daily?.time.indexOf(targetDate);
    if (typeof forecastIndex === "number" && forecastIndex >= 0 && weather?.daily) {
      return {
        code: weather.daily.weather_code[forecastIndex],
        temperature: weather.daily.temperature_2m_max[forecastIndex],
        secondaryTemperature: weather.daily.temperature_2m_min[forecastIndex],
        isTripForecast: true,
      };
    }
    if (!weather?.current) return undefined;
    return {
      code: weather.current.weather_code,
      temperature: weather.current.temperature_2m,
      isTripForecast: false,
    };
  }, [targetDate, weather]);

  if (failed) return <div className={`${styles.weatherCard} ${styles.weatherUnavailable}`}><span>Weather</span><b>Unavailable</b></div>;
  if (!view) return <div className={`${styles.weatherCard} ${styles.weatherLoading}`} aria-label={`Loading weather for ${city}`}><span>Live weather</span><i /></div>;

  const { label, Icon } = getCondition(view.code);
  return (
    <aside className={styles.weatherCard} aria-label={`${view.isTripForecast ? "Trip forecast" : "Current weather"} for ${city}`}>
      <Icon aria-hidden="true" />
      <strong>{Math.round(view.temperature)}°</strong>
      <div className={styles.weatherText}>
        <span>{view.isTripForecast ? `${label} · ${Math.round(view.secondaryTemperature ?? 0)}° low` : label}</span>
        <small>{view.isTripForecast ? "Trip forecast" : "Live · 2027 pending"}</small>
      </div>
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" aria-label="Weather data from Open-Meteo">Meteo ↗</a>
    </aside>
  );
}
