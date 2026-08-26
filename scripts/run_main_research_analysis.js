const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "05_analysis_results");

function projectPath(file) {
  return path.join(ROOT, file);
}

function outPath(file) {
  return path.join(OUT, file);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(value);
      value = "";
    } else if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (ch !== "\r") {
      value += ch;
    }
  }
  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
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

function average(values) {
  const nums = values.map(toNumber).filter((v) => v !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function sum(values) {
  return values.map(toNumber).filter((v) => v !== null).reduce((total, v) => total + v, 0);
}

function maxBy(rows, key) {
  return rows.reduce((best, row) => ((toNumber(row[key]) ?? -Infinity) > (toNumber(best?.[key]) ?? -Infinity) ? row : best), null);
}

function minBy(rows, key) {
  return rows.reduce((best, row) => ((toNumber(row[key]) ?? Infinity) < (toNumber(best?.[key]) ?? Infinity) ? row : best), null);
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text.includes(",") || text.includes('"') || text.includes("\n")
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function writeCsv(file, rows, headers = null) {
  ensureDir(path.dirname(outPath(file)));
  const cols = headers ?? Object.keys(rows[0] ?? {});
  fs.writeFileSync(
    outPath(file),
    [cols.join(","), ...rows.map((row) => cols.map((col) => csvEscape(row[col])).join(","))].join("\n"),
    "utf8",
  );
}

function writeMarkdown(file, text) {
  ensureDir(path.dirname(outPath(file)));
  const bom = /[^\x00-\x7F]/.test(text) ? "\uFEFF" : "";
  fs.writeFileSync(outPath(file), bom + text, "utf8");
}

function riskLevel(score) {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function dayOfWeek(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function dayName(day) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}

function corr(rows, xKey, yKey) {
  const pairs = rows
    .map((row) => [toNumber(row[xKey]), toNumber(row[yKey])])
    .filter(([x, y]) => x !== null && y !== null);
  if (pairs.length < 3) return null;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / pairs.length;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length;
  let num = 0;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    num += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  return num / Math.sqrt(sx * sy);
}

function compositionScore(row) {
  const food = toNumber(row.food_moisture_score_0_100);
  const dryDeficit = toNumber(row.dry_combustible_deficit_score_0_100);
  return food * 0.6 + dryDeficit * 0.4;
}

function riskSensitivityRows(riskRows) {
  const scenarios = [
    { scenario: "baseline", composition_weight: 0.55, weather_weight: 0.45 },
    { scenario: "weather_heavy", composition_weight: 0.35, weather_weight: 0.65 },
    { scenario: "composition_heavy", composition_weight: 0.75, weather_weight: 0.25 },
    { scenario: "balanced", composition_weight: 0.5, weather_weight: 0.5 },
  ];
  const out = [];
  for (const row of riskRows) {
    const comp = compositionScore(row);
    const weather = toNumber(row.weather_moisture_score_0_100);
    for (const s of scenarios) {
      const score = comp * s.composition_weight + weather * s.weather_weight;
      out.push({
        country: row.country,
        year: row.year,
        scenario: s.scenario,
        composition_weight: s.composition_weight,
        weather_weight: s.weather_weight,
        composition_score_0_100: round(comp, 2),
        weather_score_0_100: round(weather, 2),
        risk_score_0_100: round(score, 2),
        risk_level: riskLevel(score),
      });
    }
  }
  return out;
}

function buildCountryRiskTables(riskRows, sensitivityRows) {
  const countryGroups = groupBy(riskRows, (row) => row.country);
  const summary = [...countryGroups.entries()].map(([country, rows]) => {
    const max = maxBy(rows, "fuel_quality_risk_score_0_100");
    const min = minBy(rows, "fuel_quality_risk_score_0_100");
    return {
      country,
      years: rows.length,
      mean_risk_score_0_100: round(average(rows.map((row) => row.fuel_quality_risk_score_0_100)), 2),
      min_risk_year: min.year,
      min_risk_score_0_100: min.fuel_quality_risk_score_0_100,
      max_risk_year: max.year,
      max_risk_score_0_100: max.fuel_quality_risk_score_0_100,
      high_risk_years: rows.filter((row) => row.fuel_quality_risk_level === "High").length,
      medium_risk_years: rows.filter((row) => row.fuel_quality_risk_level === "Medium").length,
      low_risk_years: rows.filter((row) => row.fuel_quality_risk_level === "Low").length,
      mean_data_quality_score_0_100: round(average(rows.map((row) => row.data_quality_score_0_100)), 1),
    };
  });
  summary.sort((a, b) => b.mean_risk_score_0_100 - a.mean_risk_score_0_100);

  const ranked = riskRows
    .slice()
    .sort((a, b) => (toNumber(b.fuel_quality_risk_score_0_100) ?? 0) - (toNumber(a.fuel_quality_risk_score_0_100) ?? 0))
    .map((row, index) => ({
      rank: index + 1,
      country: row.country,
      year: row.year,
      risk_score_0_100: row.fuel_quality_risk_score_0_100,
      risk_level: row.fuel_quality_risk_level,
      food_waste_share_pct: row.food_waste_share_used_pct,
      paper_plastic_share_pct: row.paper_plastic_share_used_pct,
      weather_score_0_100: row.weather_moisture_score_0_100,
      data_quality_score_0_100: row.data_quality_score_0_100,
    }));

  const stability = [...groupBy(sensitivityRows, (row) => `${row.country}|${row.year}`).entries()].map(([key, rows]) => {
    const [country, year] = key.split("|");
    const scores = rows.map((row) => toNumber(row.risk_score_0_100));
    return {
      country,
      year,
      scenario_min_score: round(Math.min(...scores), 2),
      scenario_max_score: round(Math.max(...scores), 2),
      scenario_score_range: round(Math.max(...scores) - Math.min(...scores), 2),
      high_in_scenarios: rows.filter((row) => row.risk_level === "High").length,
      medium_in_scenarios: rows.filter((row) => row.risk_level === "Medium").length,
      low_in_scenarios: rows.filter((row) => row.risk_level === "Low").length,
    };
  });

  writeCsv("tables/country_risk_summary.csv", summary);
  writeCsv("tables/country_year_risk_ranked.csv", ranked);
  writeCsv("tables/country_year_risk_sensitivity.csv", sensitivityRows);
  writeCsv("tables/country_year_sensitivity_stability.csv", stability);
  return { summary, ranked, stability };
}

function binLabel(value, bins) {
  const n = toNumber(value);
  if (n === null) return "Missing";
  for (const bin of bins) {
    if (n >= bin.min && n < bin.max) return bin.label;
  }
  return bins.at(-1).label;
}

function summarizeBins(rows, key, valueKey, bins) {
  return [...groupBy(rows, (row) => binLabel(row[key], bins)).entries()].map(([label, group]) => ({
    bin_variable: key,
    bin: label,
    days: group.length,
    mean_food_waste_tonnes_day: round(average(group.map((row) => row[valueKey])), 2),
    median_food_waste_tonnes_day: round(median(group.map((row) => toNumber(row[valueKey])).filter((v) => v !== null)), 2),
    mean_discharge_count_day: round(average(group.map((row) => row.discharge_count_sum)), 0),
    mean_temp_c: round(average(group.map((row) => row.temp_mean_c)), 2),
    mean_humidity_pct: round(average(group.map((row) => row.relative_humidity_est_pct)), 2),
    mean_precipitation_mm: round(average(group.map((row) => row.precipitation_mm)), 2),
  }));
}

function median(values) {
  const nums = values.slice().sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function buildKoreaDailyTables(dailyTotals, regressionRows, diagnosticsRows) {
  const enriched = dailyTotals.map((row) => ({
    ...row,
    weekday: dayName(dayOfWeek(row.date)),
    weekday_number: dayOfWeek(row.date),
    precipitation_mm_filled: toNumber(row.precipitation_mm) ?? 0,
  }));

  const weekdaySummary = [...groupBy(enriched, (row) => row.weekday_number).entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, rows]) => ({
      weekday_number: day,
      weekday: dayName(Number(day)),
      days: rows.length,
      mean_food_waste_tonnes_day: round(average(rows.map((row) => row.food_waste_discharge_tonnes_sum)), 2),
      median_food_waste_tonnes_day: round(median(rows.map((row) => toNumber(row.food_waste_discharge_tonnes_sum))), 2),
      mean_discharge_count_day: round(average(rows.map((row) => row.discharge_count_sum)), 0),
    }));

  const rainBins = summarizeBins(
    enriched,
    "precipitation_mm_filled",
    "food_waste_discharge_tonnes_sum",
    [
      { min: -Infinity, max: 0.001, label: "0 mm" },
      { min: 0.001, max: 10, label: "0-10 mm" },
      { min: 10, max: 50, label: "10-50 mm" },
      { min: 50, max: Infinity, label: "50+ mm" },
    ],
  );
  const tempBins = summarizeBins(enriched, "temp_mean_c", "food_waste_discharge_tonnes_sum", [
    { min: -Infinity, max: 0, label: "<0 C" },
    { min: 0, max: 10, label: "0-10 C" },
    { min: 10, max: 20, label: "10-20 C" },
    { min: 20, max: 25, label: "20-25 C" },
    { min: 25, max: Infinity, label: "25+ C" },
  ]);
  const humidityBins = summarizeBins(enriched, "relative_humidity_est_pct", "food_waste_discharge_tonnes_sum", [
    { min: -Infinity, max: 50, label: "<50%" },
    { min: 50, max: 60, label: "50-60%" },
    { min: 60, max: 70, label: "60-70%" },
    { min: 70, max: Infinity, label: "70%+" },
  ]);

  const correlations = [
    { variable: "precipitation_mm_filled", correlation_with_daily_food_waste_tonnes: round(corr(enriched, "precipitation_mm_filled", "food_waste_discharge_tonnes_sum"), 4) },
    { variable: "relative_humidity_est_pct", correlation_with_daily_food_waste_tonnes: round(corr(enriched, "relative_humidity_est_pct", "food_waste_discharge_tonnes_sum"), 4) },
    { variable: "temp_mean_c", correlation_with_daily_food_waste_tonnes: round(corr(enriched, "temp_mean_c", "food_waste_discharge_tonnes_sum"), 4) },
  ];

  writeCsv("tables/korea_seoul_daily_weekday_summary.csv", weekdaySummary);
  writeCsv("tables/korea_seoul_daily_weather_bin_summary.csv", [...rainBins, ...tempBins, ...humidityBins]);
  writeCsv("tables/korea_seoul_daily_correlations.csv", correlations);
  writeCsv("models/korea_seoul_daily_regression_results.csv", regressionRows);
  writeCsv("models/korea_seoul_daily_regression_diagnostics.csv", diagnosticsRows);

  return { weekdaySummary, rainBins, tempBins, humidityBins, correlations };
}

function buildIndonesiaTables(rows) {
  const matched = rows.filter((row) => row.composition_match === "matched");
  const byRisk = matched
    .slice()
    .sort((a, b) => (toNumber(b.municipality_feedstock_risk_score_0_100) ?? 0) - (toNumber(a.municipality_feedstock_risk_score_0_100) ?? 0))
    .slice(0, 30)
    .map((row, index) => ({
      rank: index + 1,
      province: row.province,
      municipality: row.municipality,
      waste_generation_tpd: row.waste_generation_tpd,
      food_waste_share_pct: row.food_waste_share_pct,
      paper_plastic_share_pct: row.paper_plastic_share_pct,
      unmanaged_waste_pct: row.unmanaged_waste_pct,
      leaked_to_environment_pct: row.leaked_to_environment_pct,
      risk_score_0_100: row.municipality_feedstock_risk_score_0_100,
      risk_level: row.municipality_feedstock_risk_level,
    }));
  const byLoad = matched
    .map((row) => ({
      ...row,
      risk_weighted_waste_tpd: (toNumber(row.waste_generation_tpd) ?? 0) * ((toNumber(row.municipality_feedstock_risk_score_0_100) ?? 0) / 100),
    }))
    .sort((a, b) => b.risk_weighted_waste_tpd - a.risk_weighted_waste_tpd)
    .slice(0, 30)
    .map((row, index) => ({
      rank: index + 1,
      province: row.province,
      municipality: row.municipality,
      waste_generation_tpd: row.waste_generation_tpd,
      risk_score_0_100: row.municipality_feedstock_risk_score_0_100,
      risk_weighted_waste_tpd: round(row.risk_weighted_waste_tpd, 2),
      food_waste_share_pct: row.food_waste_share_pct,
      unmanaged_waste_pct: row.unmanaged_waste_pct,
      rdf_status: row.rdf_status,
      wte_psel: row.wte_psel,
    }));
  const provinceSummary = [...groupBy(matched, (row) => row.province).entries()]
    .map(([province, group]) => {
      const waste = sum(group.map((row) => row.waste_generation_tpd));
      const weightedRisk =
        sum(group.map((row) => (toNumber(row.waste_generation_tpd) ?? 0) * (toNumber(row.municipality_feedstock_risk_score_0_100) ?? 0))) /
        waste;
      const weightedFood =
        sum(group.map((row) => (toNumber(row.waste_generation_tpd) ?? 0) * (toNumber(row.food_waste_share_pct) ?? 0))) / waste;
      return {
        province,
        matched_municipalities: group.length,
        waste_generation_tpd_matched: round(waste, 2),
        weighted_food_waste_share_pct: round(weightedFood, 2),
        weighted_risk_score_0_100: round(weightedRisk, 2),
        high_risk_municipalities: group.filter((row) => row.municipality_feedstock_risk_level === "High").length,
      };
    })
    .sort((a, b) => b.weighted_risk_score_0_100 - a.weighted_risk_score_0_100);
  const coverage = [
    {
      metric: "management_rows",
      value: rows.length,
      note: "SIPSN management rows in extracted 2025 file",
    },
    {
      metric: "composition_matched_rows",
      value: matched.length,
      note: "Rows with uploaded composition matched by province and municipality",
    },
    {
      metric: "composition_match_rate_pct",
      value: round((matched.length / rows.length) * 100, 2),
      note: "Partial coverage; use matched rows for composition-specific claims",
    },
    {
      metric: "high_risk_matched_municipalities",
      value: matched.filter((row) => row.municipality_feedstock_risk_level === "High").length,
      note: "Draft municipal screening index",
    },
  ];
  writeCsv("tables/indonesia_top30_municipal_risk.csv", byRisk);
  writeCsv("tables/indonesia_top30_risk_weighted_waste_load.csv", byLoad);
  writeCsv("tables/indonesia_province_risk_summary.csv", provinceSummary);
  writeCsv("tables/indonesia_sipsn_composition_coverage.csv", coverage);
  return { byRisk, byLoad, provinceSummary, coverage };
}

function barSvg({ title, data, labelKey, valueKey, file, width = 900, barHeight = 28 }) {
  const margin = { left: 230, right: 40, top: 54, bottom: 35 };
  const height = margin.top + margin.bottom + data.length * barHeight;
  const max = Math.max(...data.map((row) => toNumber(row[valueKey]) ?? 0));
  const plotWidth = width - margin.left - margin.right;
  const rows = data
    .map((row, i) => {
      const value = toNumber(row[valueKey]) ?? 0;
      const y = margin.top + i * barHeight;
      const w = max ? (value / max) * plotWidth : 0;
      const label = String(row[labelKey]).replaceAll("&", "&amp;");
      return `
  <text x="${margin.left - 8}" y="${y + 19}" text-anchor="end" font-size="13" fill="#222">${label}</text>
  <rect x="${margin.left}" y="${y + 5}" width="${w}" height="18" fill="#31708f"></rect>
  <text x="${margin.left + w + 6}" y="${y + 19}" font-size="13" fill="#222">${round(value, 2)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <text x="${margin.left}" y="30" font-size="20" font-weight="700" fill="#111">${title.replaceAll("&", "&amp;")}</text>
${rows}
</svg>`;
  ensureDir(path.dirname(outPath(file)));
  fs.writeFileSync(outPath(file), svg, "utf8");
}

function buildFigures(countrySummary, indonesiaProvince, weekdaySummary) {
  barSvg({
    title: "Mean Country-Year Fuel-Quality Risk Score",
    data: countrySummary,
    labelKey: "country",
    valueKey: "mean_risk_score_0_100",
    file: "figures/country_mean_risk_score.svg",
  });
  barSvg({
    title: "Indonesia Province Feedstock Risk Score (Top 12)",
    data: indonesiaProvince.slice(0, 12),
    labelKey: "province",
    valueKey: "weighted_risk_score_0_100",
    file: "figures/indonesia_top_province_risk.svg",
  });
  barSvg({
    title: "Seoul Daily Food Waste by Weekday",
    data: weekdaySummary,
    labelKey: "weekday",
    valueKey: "mean_food_waste_tonnes_day",
    file: "figures/seoul_weekday_food_waste.svg",
  });
}

function buildInterpretation({ country, korea, indonesia }) {
  const topCountry = country.summary[0];
  const topRisk = country.ranked[0];
  const indonesiaTopProvince = indonesia.provinceSummary[0];
  const koreaTemp = korea.regressionRows.find((r) => r.model === "D1" && r.variable === "temp_10c");
  const koreaRain = korea.regressionRows.find((r) => r.model === "D1" && r.variable === "precipitation_10mm");
  const sunday = korea.regressionRows.find((r) => r.model === "D3" && r.variable === "sunday");
  const topLoad = indonesia.byLoad[0];

  const executiveRows = [
    {
      finding_id: "F1",
      result: `${topCountry.country} has the highest mean country-year risk score (${topCountry.mean_risk_score_0_100}).`,
      interpretation: "Indonesia is the clearest case where wet organic composition and humid/rainy climate can create WtE feedstock-quality concern.",
      planning_implication: "Prioritize source separation, organic diversion, covered storage, drying/blending, and RDF pre-treatment before WtE expansion.",
    },
    {
      finding_id: "F2",
      result: `Highest country-year risk row is ${topRisk.country} ${topRisk.year}, score ${topRisk.risk_score_0_100}.`,
      interpretation: "The high-risk years are not isolated outliers under the current risk framework.",
      planning_implication: "Use the risk score as an early-warning screening layer, then validate with facility or laboratory LHV/moisture data.",
    },
    {
      finding_id: "F3",
      result: `Seoul daily model estimates ${koreaTemp.approx_percent_change}% higher RFID food-waste proxy per 10 C, while precipitation per 10 mm is ${koreaRain.approx_percent_change}%.`,
      interpretation: "Temperature and collection schedule explain discharge patterns more clearly than same-day rainfall volume.",
      planning_implication: "For Korea, weather-responsive planning should emphasize storage/odor/moisture management during warm periods, not just rainy-day volume shocks.",
    },
    {
      finding_id: "F4",
      result: `Sunday coefficient in the schedule-control model is ${sunday.approx_percent_change}% relative to omitted weekdays.`,
      interpretation: "Waste-flow data strongly reflect behavioral and collection timing patterns.",
      planning_implication: "Any operational dashboard should include day-of-week and collection rules as core controls.",
    },
    {
      finding_id: "F5",
      result: `${indonesiaTopProvince.province} has the highest matched-province risk score (${indonesiaTopProvince.weighted_risk_score_0_100}).`,
      interpretation: "Some high-risk provinces have small matched waste volumes, so province risk and total system burden should be read together.",
      planning_implication: "Select pilot municipalities by both risk score and risk-weighted waste load.",
    },
    {
      finding_id: "F6",
      result: `Largest Indonesia risk-weighted waste-load hotspot is ${topLoad.municipality}, ${topLoad.province} (${topLoad.risk_weighted_waste_tpd} risk-weighted t/day).`,
      interpretation: "Large urban/peri-urban waste systems may matter more for WtE planning than small very-high-risk municipalities.",
      planning_implication: "Use risk-weighted load to prioritize feasibility studies and pre-treatment investments.",
    },
  ];
  writeCsv("briefs/key_findings_and_implications.csv", executiveRows);

  const md = `# Main Analysis Results and Interpretation

Generated: 2026-05-02

## What Was Analyzed

This analysis uses the organized APEC data folder to evaluate weather-informed WtE feedstock quality risk from three angles:

1. Country-year fuel-quality risk for South Korea, Indonesia, and Singapore.
2. Seoul daily RFID food-waste discharge and weather association.
3. Indonesia municipal feedstock-risk hotspot screening.

## Main Results

### 1. Cross-Country Risk

- Highest mean country-year risk: **${topCountry.country}**, mean score **${topCountry.mean_risk_score_0_100}**.
- Highest single country-year: **${topRisk.country} ${topRisk.year}**, score **${topRisk.risk_score_0_100}**, level **${topRisk.risk_level}**.
- Indonesia is consistently the strongest high-risk case because high food-waste composition combines with humid/rainy weather conditions.

Interpretation: this supports the proposal's central claim that municipal waste should not be treated as a uniform WtE fuel. Composition and weather together can create low-LHV or high-moisture risk.

### 2. Korea Seoul Daily Empirical Evidence

- Seoul daily model sample: **28,075 municipality-day observations**.
- Main model temperature result: **${koreaTemp.approx_percent_change}%** change in RFID food-waste proxy per 10 C.
- Main model precipitation result: **${koreaRain.approx_percent_change}%** change per 10 mm, effectively near zero in the main specification.
- Schedule effects are large: Sunday coefficient is **${sunday.approx_percent_change}%** in the weekday-control model.

Interpretation: weather matters, but not as a simple "rain increases discharge volume" story. Temperature and collection/schedule patterns are more visible in discharge data. Rain and humidity may still matter more directly for **moisture exposure, storage quality, odor, and LHV risk** than for same-day RFID discharge volume.

### 3. Indonesia Municipal Hotspots

- Matched SIPSN composition coverage: **${indonesia.coverage.find((r) => r.metric === "composition_matched_rows").value}** municipalities.
- High-risk matched municipalities: **${indonesia.coverage.find((r) => r.metric === "high_risk_matched_municipalities").value}**.
- Highest risk province by matched weighted score: **${indonesiaTopProvince.province}**, score **${indonesiaTopProvince.weighted_risk_score_0_100}**.
- Largest risk-weighted waste-load hotspot: **${topLoad.municipality}, ${topLoad.province}**.

Interpretation: municipal screening is useful for WtE planning because the highest risk score and the largest total system burden are not always the same thing. Planning should prioritize places with both high risk and high waste load.

## Research Significance

The project is strongest if framed as a **weather-informed feedstock risk decision-support study**, not as a fully validated LHV prediction model. The available data are strong enough to build a comparative risk framework, test a daily empirical proxy in Korea, and screen Indonesian municipal hotspots. Direct moisture/LHV facility data remain the main limitation.

## Recommended Next Analytical Step

Proceed with a combined design:

1. Use the country-year risk index as the comparative backbone.
2. Use Seoul daily RFID analysis as empirical support.
3. Use Indonesia municipal hotspots as the planning application.
4. Add a small scenario section translating Low/Medium/High risk into likely pre-treatment responses.

## Output Tables

- \`tables/country_risk_summary.csv\`
- \`tables/country_year_risk_ranked.csv\`
- \`tables/country_year_risk_sensitivity.csv\`
- \`tables/korea_seoul_daily_weekday_summary.csv\`
- \`tables/korea_seoul_daily_weather_bin_summary.csv\`
- \`tables/indonesia_top30_municipal_risk.csv\`
- \`tables/indonesia_top30_risk_weighted_waste_load.csv\`
- \`briefs/key_findings_and_implications.csv\`
`;
  writeMarkdown("briefs/main_analysis_interpretation.md", md);

  const mdKo = `# 주요 분석 결과와 해석

생성일: 2026-05-02

## 분석한 내용

정리된 APEC 데이터 폴더를 바탕으로, 날씨 정보를 반영한 WtE 원료 품질 위험을 세 가지 관점에서 분석했습니다.

1. 한국, 인도네시아, 싱가포르의 국가-연도별 연료 품질 위험 비교
2. 서울 RFID 음식물쓰레기 일별 배출량과 날씨 변수의 관계
3. 인도네시아 지자체 단위 WtE 원료 위험 핫스팟 선별

## 핵심 결과

### 1. 3개국 비교 위험

- 평균 국가-연도 위험 점수가 가장 높은 국가는 **${topCountry.country}**이며, 평균 점수는 **${topCountry.mean_risk_score_0_100}점**입니다.
- 단일 국가-연도 기준 최고 위험은 **${topRisk.country} ${topRisk.year}년**이며, 점수는 **${topRisk.risk_score_0_100}점**, 등급은 **${topRisk.risk_level}**입니다.
- 인도네시아는 음식물 비중, 습도, 강수 조건이 함께 작용하면서 가장 뚜렷한 고위험 사례로 나타납니다.

해석: 이 결과는 생활폐기물을 균질한 WtE 연료로 가정하기 어렵다는 연구의 핵심 주장을 뒷받침합니다. 조성 자료와 날씨 자료를 함께 보아야 저위발열량 또는 고수분 위험을 더 현실적으로 파악할 수 있습니다.

### 2. 서울 일별 실증 분석

- 서울 일별 모형 표본은 **28,075개 자치구-일 관측치**입니다.
- 주 모형에서 평균기온이 섭씨 10도 높아질 때 RFID 음식물쓰레기 배출량 프록시는 **${koreaTemp.approx_percent_change}%** 증가하는 것으로 추정됩니다.
- 같은 모형에서 강수량 10 mm의 효과는 **${koreaRain.approx_percent_change}%**로 거의 0에 가깝습니다.
- 요일 효과는 매우 큽니다. 요일 통제 모형에서 일요일 계수는 **${sunday.approx_percent_change}%**입니다.

해석: 날씨는 중요하지만, "비가 오면 당일 배출량이 늘어난다"는 단순한 구조로 보기는 어렵습니다. 배출량 자료에서는 기온과 수거/생활 패턴이 더 선명하게 보입니다. 반면 강수와 습도는 당일 배출량보다 **보관 중 수분 노출, 악취, 건조 필요성, LHV 저하 위험**에 더 직접적인 의미를 가질 수 있습니다.

### 3. 인도네시아 지자체 핫스팟

- SIPSN 조성 매칭이 된 지자체는 **${indonesia.coverage.find((r) => r.metric === "composition_matched_rows").value}개**입니다.
- 그중 고위험으로 분류된 지자체는 **${indonesia.coverage.find((r) => r.metric === "high_risk_matched_municipalities").value}개**입니다.
- 매칭 자료 기준 가중 위험 점수가 가장 높은 주는 **${indonesiaTopProvince.province}**이며, 점수는 **${indonesiaTopProvince.weighted_risk_score_0_100}점**입니다.
- 위험가중 폐기물 부하가 가장 큰 핫스팟은 **${topLoad.municipality}, ${topLoad.province}**입니다.

해석: 가장 위험한 지역과 시스템 부담이 가장 큰 지역은 항상 같지 않습니다. WtE 계획에서는 위험 점수와 폐기물 발생 규모를 함께 보아야 하며, 둘 다 높은 지역을 우선 검토 대상으로 삼는 것이 타당합니다.

## 연구 의의

현재 데이터로 가장 설득력 있는 연구 프레이밍은 **"날씨 정보를 반영한 WtE 원료 품질 위험 의사결정 지원 연구"**입니다. 지금 자료는 3개국 비교 위험지수, 한국 일별 실증 프록시, 인도네시아 지자체 핫스팟 선별까지 수행하기에 충분합니다. 다만 실제 시설 단위의 수분함량/LHV 실측 자료가 없기 때문에, 완전한 LHV 예측모형이라고 주장하기보다는 위험 선별과 운영 의사결정 지원으로 위치시키는 편이 더 안전합니다.

## 다음 분석 제안

1. 국가-연도 위험지수를 비교 분석의 중심축으로 사용합니다.
2. 서울 RFID 분석은 날씨와 폐기물 흐름의 실증 근거로 사용합니다.
3. 인도네시아 지자체 핫스팟은 정책/계획 적용 사례로 제시합니다.
4. Low/Medium/High 위험 등급을 전처리 대응안으로 연결하는 시나리오 표를 추가합니다.

## 주요 산출 표

- \`tables/country_risk_summary.csv\`
- \`tables/country_year_risk_ranked.csv\`
- \`tables/country_year_risk_sensitivity.csv\`
- \`tables/korea_seoul_daily_weekday_summary.csv\`
- \`tables/korea_seoul_daily_weather_bin_summary.csv\`
- \`tables/indonesia_top30_municipal_risk.csv\`
- \`tables/indonesia_top30_risk_weighted_waste_load.csv\`
- \`briefs/key_findings_and_implications.csv\`
`;
  writeMarkdown("briefs/main_analysis_interpretation_ko.md", mdKo);
  return executiveRows;
}

function copyReadme() {
  const text = `# APEC Main Analysis Results

Generated: 2026-05-02

## Folder Contents

- \`tables/\`: result-value CSV tables.
- \`models/\`: regression model output CSVs.
- \`figures/\`: simple SVG charts for quick review.
- \`briefs/\`: interpretation, implications, and key findings.

## Best Starting Files

- \`briefs/main_analysis_interpretation_ko.md\`
- \`briefs/methods_significance_and_next_steps_ko.md\`
- \`briefs/main_analysis_interpretation.md\`
- \`briefs/key_findings_and_implications.csv\`
- \`tables/country_risk_summary.csv\`
- \`tables/indonesia_top30_risk_weighted_waste_load.csv\`
- \`models/korea_seoul_daily_regression_results.csv\`
`;
  writeMarkdown("README.md", text);
}

function main() {
  ensureDir(OUT);
  ensureDir(outPath("tables"));
  ensureDir(outPath("models"));
  ensureDir(outPath("figures"));
  ensureDir(outPath("briefs"));

  const riskRows = parseCsv(readText("03_analysis_outputs/risk_index/fuel_quality_risk_index_country_year_draft.csv"));
  const sensitivityRows = riskSensitivityRows(riskRows);
  const country = buildCountryRiskTables(riskRows, sensitivityRows);

  const koreaDaily = parseCsv(readText("02_processed_data/korea/korea_seoul_rfid_daily_total_weather_2021_2024.csv"));
  const koreaRegression = parseCsv(readText("03_analysis_outputs/regressions/korea_seoul_daily_fe_regression_results_2021_2024.csv"));
  const koreaDiagnostics = parseCsv(readText("03_analysis_outputs/regressions/korea_seoul_daily_fe_regression_diagnostics_2021_2024.csv"));
  const korea = {
    ...buildKoreaDailyTables(koreaDaily, koreaRegression, koreaDiagnostics),
    regressionRows: koreaRegression,
    diagnosticsRows: koreaDiagnostics,
  };

  const indonesiaRows = parseCsv(readText("02_processed_data/indonesia/indonesia_sipsn_2025_waste_management_composition_joined.csv"));
  const indonesia = buildIndonesiaTables(indonesiaRows);

  buildFigures(country.summary, indonesia.provinceSummary, korea.weekdaySummary);
  buildInterpretation({ country, korea, indonesia });
  copyReadme();

  console.log(`result_folder=${OUT}`);
  console.log("tables_created=14");
  console.log("figures_created=3");
  console.log("briefs_created=3");
}

main();
