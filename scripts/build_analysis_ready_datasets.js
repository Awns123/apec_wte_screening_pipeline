const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function projectPath(file) {
  return path.join(ROOT, file);
}

function readText(file) {
  return fs.readFileSync(projectPath(file), "utf8").replace(/^\uFEFF/, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift();
  return rows
    .filter((r) => r.some((cell) => cell !== ""))
    .map((r) => Object.fromEntries(headers.map((header, index) => [header, r[index] ?? ""])));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return Number(value.toFixed(digits));
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text.includes(",") || text.includes('"') || text.includes("\n")
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function writeCsv(file, rows, headers = null) {
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const text = [cols.join(","), ...rows.map((row) => cols.map((col) => csvEscape(row[col])).join(","))].join("\n");
  fs.mkdirSync(path.dirname(projectPath(file)), { recursive: true });
  fs.writeFileSync(projectPath(file), text, "utf8");
}

function indexBy(rows, keyFn) {
  const index = new Map();
  for (const row of rows) index.set(keyFn(row), row);
  return index;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value, min, max) {
  const n = toNumber(value);
  if (n === null) return null;
  return clamp(((n - min) / (max - min)) * 100);
}

function riskLevel(score) {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function average(values) {
  const nums = values.map(toNumber).filter((v) => v !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function correlation(rows, xKey, yKey) {
  const pairs = rows
    .map((row) => [toNumber(row[xKey]), toNumber(row[yKey])])
    .filter(([x, y]) => x !== null && y !== null);
  if (pairs.length < 3) return null;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  let numerator = 0;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    numerator += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  if (!sx || !sy) return null;
  return numerator / Math.sqrt(sx * sy);
}

function pivotMetrics(rows) {
  const out = new Map();
  for (const row of rows) {
    const year = Math.round(toNumber(row.data_year));
    if (!year) continue;
    if (!out.has(year)) out.set(year, {});
    out.get(year)[row.metric_name] = toNumber(row.value_numeric);
  }
  return out;
}

function buildKoreaSummary(koreaMetrics, annualWeather) {
  const metrics = pivotMetrics(koreaMetrics);
  const weatherByKey = indexBy(annualWeather, (row) => `${row.country}|${row.year}`);
  const foodShareProxy =
    ((metrics.get(2022)?.food_waste_separated_disposed ?? null) /
      (metrics.get(2022)?.household_waste_per_person_daily ?? null)) *
    100;

  const rows = [];
  for (const year of [...metrics.keys()].sort()) {
    const m = metrics.get(year);
    if (!m.total_waste_generated_and_treated) continue;
    const totalTpd = m.total_waste_generated_and_treated;
    const recycledTpd = m.recycled ?? null;
    const landfilledTpd = m.landfilled ?? null;
    const householdTpd = m.household_equivalent_waste_generated ?? null;
    const useFoodProxy = year === 2022 && householdTpd && Number.isFinite(foodShareProxy);
    const weather = weatherByKey.get(`South Korea|${year}`) ?? {};
    rows.push({
      country: "South Korea",
      year,
      total_waste_generated_tpy: round(totalTpd * 365, 1),
      total_waste_generated_tpd: round(totalTpd, 3),
      per_capita_waste_kg_day_person: m.per_capita_household_equivalent_waste_generated ?? "",
      food_waste_tpy: useFoodProxy ? round(householdTpd * (foodShareProxy / 100) * 365, 1) : "",
      food_waste_tpd: useFoodProxy ? round(householdTpd * (foodShareProxy / 100), 3) : "",
      food_waste_share_pct: useFoodProxy ? round(foodShareProxy, 3) : "",
      paper_waste_tpy: "",
      paper_waste_tpd: "",
      paper_waste_share_pct: "",
      plastic_waste_tpy: "",
      plastic_waste_tpd: "",
      plastic_waste_share_pct: "",
      incinerated_tpd: m.incinerated ?? "",
      landfill_or_disposed_tpy: landfilledTpd !== null ? round(landfilledTpd * 365, 1) : "",
      landfill_or_disposed_tpd: landfilledTpd ?? "",
      other_methods_tpd: m.other_treatment ?? "",
      recycled_tpy: recycledTpd !== null ? round(recycledTpd * 365, 1) : "",
      recycling_rate_pct: recycledTpd !== null ? round((recycledTpd / totalTpd) * 100, 3) : "",
      weather_location_proxy: weather.location_proxy ?? "",
      weather_temp_mean_c: weather.temp_mean_c ?? "",
      weather_relative_humidity_pct: weather.relative_humidity_pct ?? "",
      weather_precipitation_mm_total: weather.precipitation_mm_total ?? "",
      weather_precipitation_days_1mm: weather.precipitation_days_1mm ?? "",
      weather_precipitation_days_10mm: weather.precipitation_days_10mm ?? "",
      weather_wind_speed_mps: weather.wind_speed_mps ?? "",
      primary_source:
        year === 2022
          ? "e-Nara official waste table; 2022 food-waste share estimated from MOE survey per-capita food-separated disposal / household waste"
          : "e-Nara official waste table",
      weather_source: weather.source ?? "",
    });
  }
  return rows;
}

function readCompositionOverrides() {
  const file = projectPath("02_processed_data/indonesia/indonesia_sipsn_2025_weighted_composition_summary.csv");
  if (!fs.existsSync(file)) return new Map();
  const rows = parseCsv(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const overrides = new Map();
  for (const row of rows) {
    overrides.set(`${row.country}|${row.year}`, row);
  }
  return overrides;
}

function applyCompositionOverrides(panel, overrides) {
  return panel.map((row) => {
    const override = overrides.get(`${row.country}|${row.year}`);
    if (!override) return row;
    const totalTpd = toNumber(row.total_waste_generated_tpd);
    const foodShare = toNumber(override.weighted_food_waste_share_pct);
    const paperShare = toNumber(override.weighted_paper_cardboard_share_pct);
    const plasticShare = toNumber(override.weighted_plastic_share_pct);
    return {
      ...row,
      food_waste_share_pct: round(foodShare, 6),
      food_waste_tpd: totalTpd !== null && foodShare !== null ? round(totalTpd * foodShare / 100, 3) : row.food_waste_tpd,
      food_waste_tpy: totalTpd !== null && foodShare !== null ? round(totalTpd * foodShare / 100 * 365, 1) : row.food_waste_tpy,
      paper_waste_share_pct: round(paperShare, 6),
      paper_waste_tpd: totalTpd !== null && paperShare !== null ? round(totalTpd * paperShare / 100, 3) : row.paper_waste_tpd,
      paper_waste_tpy: totalTpd !== null && paperShare !== null ? round(totalTpd * paperShare / 100 * 365, 1) : row.paper_waste_tpy,
      plastic_waste_share_pct: round(plasticShare, 6),
      plastic_waste_tpd: totalTpd !== null && plasticShare !== null ? round(totalTpd * plasticShare / 100, 3) : row.plastic_waste_tpd,
      plastic_waste_tpy: totalTpd !== null && plasticShare !== null ? round(totalTpd * plasticShare / 100 * 365, 1) : row.plastic_waste_tpy,
      primary_source: `${row.primary_source}; 2025 composition overridden with uploaded SIPSN weighted municipality composition`,
    };
  });
}

function buildThreeCountryPanel(existingPanel, koreaRows, compositionOverrides = new Map()) {
  return applyCompositionOverrides([...existingPanel, ...koreaRows], compositionOverrides).sort((a, b) => {
    if (a.country !== b.country) return a.country.localeCompare(b.country);
    return Number(a.year) - Number(b.year);
  });
}

function fillRiskInputs(row, nasaHumidityByKey) {
  const notes = [];
  let foodShare = toNumber(row.food_waste_share_pct);
  let foodSource = "observed_or_reported";
  if (foodShare === null && row.country === "South Korea") {
    foodShare = 32.703;
    foodSource = "korea_2022_moe_proxy_reused";
    notes.push("Korea food share filled from 2022 MOE survey ratio; use as provisional proxy.");
  }

  const paperShare = toNumber(row.paper_waste_share_pct);
  const plasticShare = toNumber(row.plastic_waste_share_pct);
  let dryCombustibleShare = null;
  let dryCombustibleSource = "observed_or_reported";
  if (paperShare !== null || plasticShare !== null) {
    dryCombustibleShare = (paperShare ?? 0) + (plasticShare ?? 0);
  } else {
    dryCombustibleSource = "missing_neutral_25pct";
    dryCombustibleShare = 25;
    notes.push("Paper/plastic combustible share missing; neutral 25% placeholder used.");
  }

  let humidity = toNumber(row.weather_relative_humidity_pct);
  let humiditySource = row.weather_source;
  if (humidity === null) {
    const nasa = nasaHumidityByKey.get(`${row.country}|${row.year}`);
    humidity = toNumber(nasa?.relative_humidity_pct);
    humiditySource = nasa ? "NASA POWER humidity fallback" : "";
    if (humidity !== null) notes.push("Relative humidity filled from NASA POWER fallback.");
  }

  return {
    foodShare,
    foodSource,
    dryCombustibleShare,
    dryCombustibleSource,
    humidity,
    humiditySource,
    notes,
  };
}

function buildCountryYearRisk(panel, annualWeather) {
  const nasaHumidityByKey = indexBy(annualWeather, (row) => `${row.country}|${row.year}`);
  return panel.map((row) => {
    const inputs = fillRiskInputs(row, nasaHumidityByKey);
    const foodScore = scoreRange(inputs.foodShare, 10, 45);
    const dryDeficitScore = 100 - scoreRange(inputs.dryCombustibleShare, 15, 35);
    const rainScore = scoreRange(row.weather_precipitation_mm_total, 1000, 3000);
    const rainyDayScore = scoreRange(row.weather_precipitation_days_1mm, 100, 250);
    const humidityScore = scoreRange(inputs.humidity, 60, 30 + 60);

    const compositionScore =
      foodScore !== null && dryDeficitScore !== null
        ? foodScore * 0.6 + dryDeficitScore * 0.4
        : average([foodScore, dryDeficitScore]);
    const weatherScore =
      rainScore !== null && rainyDayScore !== null && humidityScore !== null
        ? rainScore * 0.4 + rainyDayScore * 0.25 + humidityScore * 0.35
        : average([rainScore, rainyDayScore, humidityScore]);
    const overall =
      compositionScore !== null && weatherScore !== null
        ? compositionScore * 0.55 + weatherScore * 0.45
        : average([compositionScore, weatherScore]);

    const missingPenalty = inputs.notes.length * 15;
    const quality = clamp(100 - missingPenalty, 0, 100);

    return {
      country: row.country,
      year: row.year,
      food_waste_share_used_pct: round(inputs.foodShare, 3),
      food_share_source: inputs.foodSource,
      paper_plastic_share_used_pct: round(inputs.dryCombustibleShare, 3),
      paper_plastic_source: inputs.dryCombustibleSource,
      precipitation_mm_total: row.weather_precipitation_mm_total,
      precipitation_days_1mm: row.weather_precipitation_days_1mm,
      relative_humidity_used_pct: round(inputs.humidity, 3),
      humidity_source: inputs.humiditySource,
      food_moisture_score_0_100: round(foodScore, 2),
      dry_combustible_deficit_score_0_100: round(dryDeficitScore, 2),
      weather_moisture_score_0_100: round(weatherScore, 2),
      fuel_quality_risk_score_0_100: round(overall, 2),
      fuel_quality_risk_level: riskLevel(overall),
      data_quality_score_0_100: round(quality, 0),
      interpretation_note: inputs.notes.join(" "),
    };
  });
}

function minMax(rows, key) {
  const values = rows.map((row) => toNumber(row[key])).filter((v) => v !== null);
  return { min: Math.min(...values), max: Math.max(...values) };
}

function minMaxScore(value, range) {
  const n = toNumber(value);
  if (n === null) return null;
  if (range.max === range.min) return 50;
  return clamp(((n - range.min) / (range.max - range.min)) * 100);
}

function buildSeoulMonthlyRisk(rows) {
  const foodRange = minMax(rows, "seoul_food_waste_tonnes_if_raw_is_kg_sum");
  const rainRange = minMax(rows, "precipitation_mm_total");
  const humidRange = minMax(rows, "relative_humidity_est_pct");
  const tempRange = minMax(rows, "temp_mean_c");

  return rows.map((row) => {
    const foodScore = minMaxScore(row.seoul_food_waste_tonnes_if_raw_is_kg_sum, foodRange);
    const rainScore = minMaxScore(row.precipitation_mm_total, rainRange);
    const humidScore = minMaxScore(row.relative_humidity_est_pct, humidRange);
    const tempScore = minMaxScore(row.temp_mean_c, tempRange);
    const weatherScore = rainScore * 0.35 + humidScore * 0.4 + tempScore * 0.25;
    const riskScore = foodScore * 0.55 + weatherScore * 0.45;
    return {
      country: "South Korea",
      city: "Seoul",
      date_month: row.date_month,
      year: row.year,
      month: row.month,
      food_waste_tonnes_proxy: row.seoul_food_waste_tonnes_if_raw_is_kg_sum,
      precipitation_mm_total: row.precipitation_mm_total,
      precipitation_days: row.precipitation_days,
      relative_humidity_est_pct: row.relative_humidity_est_pct,
      temp_mean_c: row.temp_mean_c,
      food_waste_proxy_score_0_100: round(foodScore, 2),
      weather_moisture_score_0_100: round(weatherScore, 2),
      monthly_fuel_quality_risk_score_0_100: round(riskScore, 2),
      monthly_fuel_quality_risk_level: riskLevel(riskScore),
    };
  });
}

function buildSummaryMarkdown({ koreaRows, riskRows, seoulRows }) {
  const highRisk = riskRows
    .filter((row) => row.fuel_quality_risk_level === "High")
    .sort((a, b) => Number(b.fuel_quality_risk_score_0_100) - Number(a.fuel_quality_risk_score_0_100))
    .slice(0, 5);
  const highRiskTable = highRisk.length
    ? highRisk
        .map(
          (row) =>
            `| ${row.country} | ${row.year} | ${row.fuel_quality_risk_score_0_100} | ${row.fuel_quality_risk_level} |`,
        )
        .join("\n")
    : "| None in this draft index |  |  |  |";

  const countryRisk = [...new Set(riskRows.map((row) => row.country))]
    .map((country) => {
      const rows = riskRows.filter((row) => row.country === country);
      return `| ${country} | ${round(average(rows.map((row) => row.fuel_quality_risk_score_0_100)), 2)} | ${rows.length} |`;
    })
    .join("\n");

  const corrFoodRain = correlation(seoulRows, "food_waste_tonnes_proxy", "precipitation_mm_total");
  const corrFoodHumidity = correlation(seoulRows, "food_waste_tonnes_proxy", "relative_humidity_est_pct");
  const corrFoodTemp = correlation(seoulRows, "food_waste_tonnes_proxy", "temp_mean_c");

  return `# Initial Analysis Ready Dataset Summary

Generated: 2026-05-02

## Files created

- \`korea_research_ready_waste_by_year.csv\`: Korea annual waste summary from official e-Nara metrics.
- \`combined_country_summary_three_country_with_weather.csv\`: Indonesia, Singapore, and South Korea annual comparison panel with weather.
- \`fuel_quality_risk_index_country_year_draft.csv\`: draft country-year Waste Fuel Quality Risk Index.
- \`korea_seoul_monthly_weather_food_waste_risk_panel.csv\`: monthly Seoul pilot risk panel.

## Country-year risk index

| Country | Mean risk score | Rows |
| --- | ---: | ---: |
${countryRisk}

Top draft high-risk rows:

| Country | Year | Risk score | Risk level |
| --- | ---: | ---: | --- |
${highRiskTable}

## Korea panel caveat

Korea annual official totals were added for ${koreaRows[0]?.year}-${koreaRows.at(-1)?.year}. Food-waste share is directly available only as a 2022 survey proxy, calculated as food-waste separated disposal per person divided by household waste per person. The risk index therefore reuses this Korea proxy for non-2022 Korea rows and marks those rows with lower data-quality scores.

## Seoul monthly pilot signals

For the Seoul monthly pilot panel, correlations between food-waste proxy and weather variables are:

- Rainfall total: ${round(corrFoodRain, 3)}
- Relative humidity: ${round(corrFoodHumidity, 3)}
- Mean temperature: ${round(corrFoodTemp, 3)}

These are exploratory correlations, not causal estimates. The next defensible step is a fixed-effects or seasonal-control regression on the monthly municipality panel.
`;
}

function main() {
  const koreaMetrics = parseCsv(readText("01_raw_data/source_extracts/korea_raw_metrics_official_primary.csv"));
  const existingPanel = parseCsv(readText("02_processed_data/panels/combined_country_summary_with_best_available_weather.csv"));
  const annualWeather = parseCsv(readText("02_processed_data/weather/nasa_power_annual_weather_country_proxies_2017_2025.csv"));
  const seoulPilot = parseCsv(readText("02_processed_data/korea/pilot_seoul_weather_food_waste_monthly_2017_2020.csv"));
  const compositionOverrides = readCompositionOverrides();

  const koreaRows = buildKoreaSummary(koreaMetrics, annualWeather);
  writeCsv("02_processed_data/korea/korea_research_ready_waste_by_year.csv", koreaRows);

  const threeCountry = buildThreeCountryPanel(existingPanel, koreaRows, compositionOverrides);
  writeCsv("02_processed_data/panels/combined_country_summary_three_country_with_weather.csv", threeCountry);

  const riskRows = buildCountryYearRisk(threeCountry, annualWeather);
  writeCsv("03_analysis_outputs/risk_index/fuel_quality_risk_index_country_year_draft.csv", riskRows);

  const seoulRows = buildSeoulMonthlyRisk(seoulPilot);
  writeCsv("03_analysis_outputs/risk_index/korea_seoul_monthly_weather_food_waste_risk_panel.csv", seoulRows);

  fs.writeFileSync(
    projectPath("03_analysis_outputs/audits/initial_analysis_ready_dataset_summary.md"),
    buildSummaryMarkdown({ koreaRows, riskRows, seoulRows }),
    "utf8",
  );

  console.log(`korea_rows=${koreaRows.length}`);
  console.log(`three_country_rows=${threeCountry.length}`);
  console.log(`risk_rows=${riskRows.length}`);
  console.log(`seoul_monthly_rows=${seoulRows.length}`);
}

main();
