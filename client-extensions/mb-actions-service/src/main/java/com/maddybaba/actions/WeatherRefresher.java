package com.maddybaba.actions;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.json.JSONArray;
import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Nightly: the next days' forecast per Destination from Open-Meteo (no API key), stored as one
 * WeatherSnapshot per destination and day (ERC MB_weather_<destination id>_<date>), replaced on
 * every run. A day is good for activities with rain probability and wind within the configured limits
 * and no thunderstorm.
 */
@Component
public class WeatherRefresher {

	public WeatherRefresher(
		LiferayClient liferayClient, @Value("${mb.weather.forecast-days}") int forecastDays,
		@Value("${mb.weather.max-rain-percent}") int maxRainPercent, @Value("${mb.weather.max-wind-kmh}") double maxWindKmh) {

		_liferayClient = liferayClient;
		_forecastDays = forecastDays;
		_maxRainPercent = maxRainPercent;
		_maxWindKmh = maxWindKmh;
	}

	public int refresh() throws Exception {
		int stored = 0;

		for (JSONObject destination : _liferayClient.getAll("/o/c/destinations")) {
			Object latitude = destination.opt("latitude");
			Object longitude = destination.opt("longitude");

			if ((latitude == null) || (longitude == null) || "".equals(latitude.toString())) {
				continue;
			}

			JSONObject daily = _forecast(latitude, longitude).getJSONObject("daily");
			JSONArray dates = daily.getJSONArray("time");

			for (int i = 0; i < dates.length(); i++) {
				int code = daily.getJSONArray("weather_code").optInt(i);
				int rain = daily.getJSONArray("precipitation_probability_max").optInt(i);
				double wind = daily.getJSONArray("wind_speed_10m_max").optDouble(i);

				_liferayClient.upsert(
					"weathersnapshots", "MB_weather_" + destination.getLong("id") + "_" + dates.getString(i),
					new JSONObject(
					).put(
						"condition", _condition(code)
					).put(
						"forecastDate", dates.getString(i)
					).put(
						"isGoodForActivity", (code < 95) && (rain <= _maxRainPercent) && (wind <= _maxWindKmh)
					).put(
						"r_destinationWeather_c_destinationId", destination.getLong("id")
					).put(
						"tempC", daily.getJSONArray("temperature_2m_max").optDouble(i)
					));

				stored++;
			}
		}

		return stored;
	}

	/**
	 * WMO weather codes as used by Open-Meteo.
	 */
	private static String _condition(int code) {
		if (code == 0) {
			return "Clear";
		}
		else if (code <= 2) {
			return "Partly cloudy";
		}
		else if (code == 3) {
			return "Overcast";
		}
		else if (code <= 48) {
			return "Fog";
		}
		else if (code <= 57) {
			return "Drizzle";
		}
		else if (code <= 67) {
			return "Rain";
		}
		else if (code <= 77) {
			return "Snow";
		}
		else if (code <= 82) {
			return "Rain showers";
		}
		else if (code <= 86) {
			return "Snow showers";
		}

		return "Thunderstorm";
	}

	private JSONObject _forecast(Object latitude, Object longitude) throws Exception {
		URI uri = URI.create(
			"https://api.open-meteo.com/v1/forecast?latitude=" + latitude + "&longitude=" + longitude +
				"&daily=weather_code,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max&timezone=Asia%2FKolkata" +
					"&forecast_days=" + _forecastDays);

		HttpResponse<String> response = _httpClient.send(
			HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20)).GET().build(), HttpResponse.BodyHandlers.ofString());

		if (response.statusCode() != 200) {
			throw new IllegalStateException("Open-Meteo returned " + response.statusCode() + " for " + uri);
		}

		_log.debug("Forecast {}", uri);

		return new JSONObject(response.body());
	}

	private static final Logger _log = LoggerFactory.getLogger(WeatherRefresher.class);

	private final int _forecastDays;
	private final HttpClient _httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
	private final LiferayClient _liferayClient;
	private final double _maxWindKmh;
	private final int _maxRainPercent;

}
