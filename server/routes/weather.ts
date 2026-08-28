import { Router } from "express";

interface WeatherResponse {
  location: string;
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  label: string;
  isDay: boolean;
  updatedAt: number;
}

const weatherCache = new Map<string, { value: WeatherResponse; expiresAt: number }>();

function weatherLabel(code: number): string {
  if (code === 0) return "晴";
  if (code <= 3) return "多云";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "下雨";
  if (code >= 71 && code <= 77) return "下雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 85 && code <= 86) return "阵雪";
  if (code >= 95) return "雷雨";
  return "天气变化中";
}

export function createWeatherRouter() {
  const router = Router();

  router.get("/api/weather", async (req, res) => {
    const city = String(req.query.city || "").trim().slice(0, 80);
    const requestedLat = Number(req.query.lat);
    const requestedLon = Number(req.query.lon);
    const hasCoordinates = Number.isFinite(requestedLat) && Number.isFinite(requestedLon)
      && requestedLat >= -90 && requestedLat <= 90 && requestedLon >= -180 && requestedLon <= 180;
    if (!city && !hasCoordinates) {
      res.status(400).json({ error: "请允许定位或填写城市。" });
      return;
    }
    const cacheKey = hasCoordinates ? `${requestedLat.toFixed(2)},${requestedLon.toFixed(2)}` : city.toLocaleLowerCase();
    const cached = weatherCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.value);
      return;
    }
    try {
      let place: { name: string; admin1?: string; latitude: number; longitude: number };
      if (hasCoordinates) {
        place = { name: "当前位置", latitude: requestedLat, longitude: requestedLon };
      } else {
        const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geoUrl.searchParams.set("name", city);
        geoUrl.searchParams.set("count", "1");
        geoUrl.searchParams.set("language", "zh");
        geoUrl.searchParams.set("format", "json");
        const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(10_000) });
        if (!geoResponse.ok) throw new Error(`城市查询失败（${geoResponse.status}）`);
        const geo = await geoResponse.json() as { results?: Array<{ name: string; admin1?: string; latitude: number; longitude: number }> };
        const found = geo.results?.[0];
        if (!found) { res.status(404).json({ error: `没有找到城市“${city}”。` }); return; }
        place = found;
      }
  
      const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
      forecastUrl.searchParams.set("latitude", String(place.latitude));
      forecastUrl.searchParams.set("longitude", String(place.longitude));
      forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,is_day");
      forecastUrl.searchParams.set("timezone", "auto");
      const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(10_000) });
      if (!forecastResponse.ok) throw new Error(`天气查询失败（${forecastResponse.status}）`);
      const forecast = await forecastResponse.json() as { current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number } };
      if (!forecast.current) throw new Error("天气服务没有返回当前天气。");
      const location = [place.name, place.admin1].filter(Boolean).join(" · ");
      const value: WeatherResponse = {
        location,
        temperature: Math.round(forecast.current.temperature_2m),
        apparentTemperature: Math.round(forecast.current.apparent_temperature),
        weatherCode: forecast.current.weather_code,
        label: weatherLabel(forecast.current.weather_code),
        isDay: forecast.current.is_day === 1,
        updatedAt: Date.now(),
      };
      weatherCache.set(cacheKey, { value, expiresAt: Date.now() + 30 * 60_000 });
      res.json(value);
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError"
        ? "天气服务连接超时，请稍后再试。"
        : error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: message });
    }
  });
  
  

  return router;
}
