const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "05_analysis_results", "final_2026-05-05");

function p(file) {
  return path.join(ROOT, file);
}

function out(file) {
  return path.join(OUT, file);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(file) {
  return fs.readFileSync(p(file), "utf8").replace(/^\uFEFF/, "");
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

function clamp(value, min, max) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value, min, max) {
  const n = toNumber(value);
  if (n === null) return null;
  return clamp(((n - min) / (max - min)) * 100, 0, 100);
}

function average(values) {
  const nums = values.map(toNumber).filter((v) => v !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function sum(values) {
  return values.map(toNumber).filter((v) => v !== null).reduce((total, v) => total + v, 0);
}

function groupBy(rows, fn) {
  const map = new Map();
  for (const row of rows) {
    const key = fn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function indexBy(rows, fn) {
  const map = new Map();
  for (const row of rows) map.set(fn(row), row);
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
  ensureDir(path.dirname(out(file)));
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const text = [cols.join(","), ...rows.map((row) => cols.map((col) => csvEscape(row[col])).join(","))].join("\n");
  fs.writeFileSync(out(file), text, "utf8");
}

function writeProjectCsv(file, rows, headers = null) {
  ensureDir(path.dirname(p(file)));
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const text = [cols.join(","), ...rows.map((row) => cols.map((col) => csvEscape(row[col])).join(","))].join("\n");
  fs.writeFileSync(p(file), text, "utf8");
}

function writeMarkdown(file, text) {
  ensureDir(path.dirname(out(file)));
  const bom = /[^\x00-\x7F]/.test(text) ? "\uFEFF" : "";
  fs.writeFileSync(out(file), bom + text, "utf8");
}

function riskLevel(score) {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function lhvBand(lhv, type) {
  if (lhv === null) return "Not estimated";
  if (type === "facility-literature-benchmark") return "Korea literature benchmark";
  if (lhv < 10) return "Low/caution";
  if (lhv < 11) return "Moderate";
  return "Favorable";
}

function finalDecision(risk, lhv, lhvType) {
  if (risk >= 70) return "High priority: source separation, drying/storage control, RDF/pre-treatment screening";
  if (lhvType !== "facility-literature-benchmark" && lhv !== null && lhv < 10) {
    return "LHV caution: verify with sampling before WtE commitment";
  }
  if (risk >= 45) return "Moderate priority: monitoring, covered storage, seasonal controls";
  return "Lower relative risk: maintain verification and routine quality control";
}

function wangEq14(food, paper, plastic) {
  if ([food, paper, plastic].some((v) => v === null)) return null;
  return (-2.42 * food + 83.2 * paper + 67.9 * plastic + 7669.08) / 1000;
}

function linEq26(paper, plastic, wood = 0, textile = 0) {
  if ([paper, plastic].some((v) => v === null)) return null;
  return (219 * plastic + 109 * (paper + (wood ?? 0) + (textile ?? 0))) / 1000;
}

function kumarMlr2(food, yard, plastic, paper, textile = 0) {
  if ([food, plastic, paper].some((v) => v === null)) return null;
  const kcal = 838.09 + 21.5 * food + 26.76 * (yard ?? 0) + 58.53 * plastic + 11.46 * paper + 37.05 * (textile ?? 0);
  return kcal * 0.004184;
}

function annualSingaporeWeather(monthlyRows) {
  const groups = groupBy(monthlyRows, (row) => row.year);
  return [...groups.entries()].map(([year, rows]) => {
    const days = sum(rows.map((r) => r.days_weather));
    const weighted = (key) => {
      const parts = rows
        .map((r) => [toNumber(r[key]), toNumber(r.days_weather)])
        .filter(([v, d]) => v !== null && d !== null);
      return parts.reduce((acc, [v, d]) => acc + v * d, 0) / parts.reduce((acc, [, d]) => acc + d, 0);
    };
    return {
      country: "Singapore",
      year,
      precipitation_mm_total: round(sum(rows.map((r) => r.precipitation_mm_total)), 3),
      precipitation_days_1mm: round(sum(rows.map((r) => r.precipitation_days_1mm)), 0),
      relative_humidity_pct: round(weighted("relative_humidity_mean_pct"), 3),
      temp_mean_c: round(weighted("temp_mean_c"), 3),
      days_weather: days,
      source: "MSS/NEA Changi daily weather + data.gov.sg S24 Upper Changi humidity",
    };
  });
}

function buildFinalCountryPanel() {
  const countryPanel = parseCsv(readText("02_processed_data/panels/combined_country_summary_three_country_with_weather.csv"));
  const sgDisposed = indexBy(
    parseCsv(readText("02_processed_data/singapore/singapore_disposed_waste_composition_lhv_lin2015_2020_2024.csv")),
    (row) => row.year,
  );
  const sgWeather = indexBy(
    annualSingaporeWeather(parseCsv(readText("02_processed_data/singapore/singapore_changi_monthly_weather_humidity_2020_2024.csv"))),
    (row) => row.year,
  );

  const koreaKwonMean = 2318 * 0.004184;
  const koreaBaeGeneralMean = 2616.3 * 0.004184;

  return countryPanel.map((row) => {
    const country = row.country;
    const year = row.year;
    const notes = [];
    let compositionBasis = "country_year_panel";
    let food = toNumber(row.food_waste_share_pct);
    let paper = toNumber(row.paper_waste_share_pct);
    let plastic = toNumber(row.plastic_waste_share_pct);
    let wood = null;
    let textile = null;
    let yard = null;
    let precip = toNumber(row.weather_precipitation_mm_total);
    let rainy = toNumber(row.weather_precipitation_days_1mm);
    let humidity = toNumber(row.weather_relative_humidity_pct);
    let temp = toNumber(row.weather_temp_mean_c);
    let weatherSource = row.weather_source;

    if (country === "Singapore" && sgDisposed.has(year)) {
      const sg = sgDisposed.get(year);
      compositionBasis = "singapore_disposed_waste_proxy";
      food = toNumber(sg.food_share_disposed_pct);
      paper = toNumber(sg.paper_share_disposed_pct);
      plastic = toNumber(sg.plastic_share_disposed_pct);
      wood = toNumber(sg.wood_share_disposed_pct);
      textile = toNumber(sg.textile_share_disposed_pct);
      yard = toNumber(sg.horticultural_share_disposed_pct);
      notes.push("Singapore composition replaced with disposed waste proxy, closer to incineration feedstock than generated totals.");
    }

    if (country === "Singapore" && sgWeather.has(year)) {
      const sw = sgWeather.get(year);
      precip = toNumber(sw.precipitation_mm_total);
      rainy = toNumber(sw.precipitation_days_1mm);
      humidity = toNumber(sw.relative_humidity_pct);
      temp = toNumber(sw.temp_mean_c);
      weatherSource = sw.source;
      notes.push("Singapore weather replaced with official Changi/S24 observed humidity-weather aggregation.");
    }

    if (country === "South Korea" && food === null) {
      food = 32.706;
      notes.push("South Korea food share filled from available 2022 proxy for non-2022 years.");
    }

    let dryCombustible = paper !== null && plastic !== null ? paper + plastic : null;
    if (dryCombustible === null) {
      dryCombustible = 25;
      notes.push("Paper/plastic combustible share missing; neutral 25% placeholder used for risk scoring only.");
    }

    const foodScore = scoreRange(food, 10, 45);
    const dryDeficitScore = 100 - scoreRange(dryCombustible, 15, 35);
    const rainScore = scoreRange(precip, 1000, 3000);
    const rainyScore = scoreRange(rainy, 100, 250);
    const humidityScore = scoreRange(humidity, 60, 90);
    const compositionScore = foodScore * 0.6 + dryDeficitScore * 0.4;
    const weatherScore = rainScore * 0.4 + rainyScore * 0.25 + humidityScore * 0.35;
    const risk = compositionScore * 0.55 + weatherScore * 0.45;
    const dataQuality = clamp(100 - notes.length * 12.5, 0, 100);

    const wang = wangEq14(food, paper, plastic);
    const lin = linEq26(paper, plastic, wood ?? 0, textile ?? 0);
    const kumar = kumarMlr2(food, yard ?? 0, plastic, paper, textile ?? 0);
    let bestLhv = wang;
    let bestModel = "Wang2021_Eq14_composition_model";
    let lhvType = "composition-model";

    if (country === "South Korea") {
      bestLhv = (koreaKwonMean + koreaBaeGeneralMean) / 2;
      bestModel = "Korea_Kwon2017_Bae2024_facility_literature_benchmark";
      lhvType = "facility-literature-benchmark";
    }

    return {
      country,
      year,
      composition_basis: compositionBasis,
      weather_basis: weatherSource,
      food_pct: round(food, 3),
      paper_pct: round(paper, 3),
      plastic_pct: round(plastic, 3),
      paper_plastic_pct: round(dryCombustible, 3),
      wood_pct: round(wood, 3),
      textile_pct: round(textile, 3),
      yard_or_horticultural_pct: round(yard, 3),
      precipitation_mm_total: round(precip, 3),
      precipitation_days_1mm: round(rainy, 0),
      relative_humidity_pct: round(humidity, 3),
      temp_mean_c: round(temp, 3),
      composition_score_0_100: round(compositionScore, 2),
      weather_moisture_score_0_100: round(weatherScore, 2),
      final_risk_score_0_100: round(risk, 2),
      final_risk_level: riskLevel(risk),
      data_quality_score_0_100: round(dataQuality, 1),
      wang2021_eq14_lhv_mj_per_kg: round(wang, 3),
      lin2015_eq26_lhv_mj_per_kg: round(lin, 3),
      kumar2023_mlr2_lhv_mj_per_kg: round(kumar, 3),
      korea_kwon2017_mean_lhv_mj_per_kg: country === "South Korea" ? round(koreaKwonMean, 3) : "",
      korea_bae2024_general_mean_lhv_mj_per_kg: country === "South Korea" ? round(koreaBaeGeneralMean, 3) : "",
      best_available_lhv_mj_per_kg: round(bestLhv, 3),
      best_available_lhv_model: bestModel,
      lhv_interpretation_type: lhvType,
      lhv_caution_band: lhvBand(bestLhv, lhvType),
      final_decision_class: finalDecision(risk, bestLhv, lhvType),
      caveat: notes.join(" "),
    };
  });
}

function buildCountrySummary(panel) {
  const groups = groupBy(panel, (row) => row.country);
  return [...groups.entries()]
    .map(([country, rows]) => {
      const maxRisk = rows.reduce((a, b) => (toNumber(a.final_risk_score_0_100) > toNumber(b.final_risk_score_0_100) ? a : b));
      const minLhv = rows.reduce((a, b) => (toNumber(a.best_available_lhv_mj_per_kg) < toNumber(b.best_available_lhv_mj_per_kg) ? a : b));
      return {
        country,
        years: rows.length,
        mean_risk_score_0_100: round(average(rows.map((r) => r.final_risk_score_0_100)), 2),
        high_risk_years: rows.filter((r) => r.final_risk_level === "High").length,
        medium_risk_years: rows.filter((r) => r.final_risk_level === "Medium").length,
        low_risk_years: rows.filter((r) => r.final_risk_level === "Low").length,
        max_risk_year: maxRisk.year,
        max_risk_score_0_100: maxRisk.final_risk_score_0_100,
        mean_best_available_lhv_mj_per_kg: round(average(rows.map((r) => r.best_available_lhv_mj_per_kg)), 3),
        min_lhv_year: minLhv.year,
        min_best_available_lhv_mj_per_kg: minLhv.best_available_lhv_mj_per_kg,
        mean_data_quality_score_0_100: round(average(rows.map((r) => r.data_quality_score_0_100)), 1),
        primary_interpretation:
          country === "Indonesia"
            ? "Highest wet-feedstock risk; prioritize separation, drying, RDF/pre-treatment and municipal screening."
            : country === "Singapore"
              ? "Lower composition risk after disposed-proxy correction; use as resilient WTE infrastructure contrast, not plant-level causal model."
              : "Useful Korea empirical proxy and facility LHV benchmark; direct national composition-LHV panel remains limited.",
      };
    })
    .sort((a, b) => toNumber(b.mean_risk_score_0_100) - toNumber(a.mean_risk_score_0_100));
}

function minMaxScores(rows, key) {
  const values = rows.map((r) => toNumber(r[key])).filter((v) => v !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return rows.map((r) => {
    const v = toNumber(r[key]);
    return v === null || max === min ? 0 : ((v - min) / (max - min)) * 100;
  });
}

function buildIndonesiaPriority() {
  const lhvRows = parseCsv(readText("02_processed_data/indonesia/indonesia_sipsn_2025_municipal_lhv_scenario_estimates.csv"));
  const joinedRows = parseCsv(readText("02_processed_data/indonesia/indonesia_sipsn_2025_waste_management_composition_joined.csv"));
  const joinedIndex = indexBy(joinedRows, (r) => `${r.province}|${r.municipality}`);
  const rows = lhvRows.map((row) => {
    const joined = joinedIndex.get(`${row.province}|${row.municipality}`) ?? {};
    const low = toNumber(row.estimated_lhv_low_food_unknown_zero_mj_per_kg);
    return {
      country: row.country,
      year: row.year,
      province: row.province,
      municipality: row.municipality,
      waste_generation_tpd: round(toNumber(row.waste_generation_tpd), 3),
      managed_waste_pct: round(toNumber(joined.managed_waste_pct), 3),
      unmanaged_waste_pct: round(toNumber(joined.unmanaged_waste_pct), 3),
      leaked_to_environment_pct: round(toNumber(joined.leaked_to_environment_pct), 3),
      food_waste_share_pct: row.food_waste_share_pct,
      paper_cardboard_share_pct: row.paper_cardboard_share_pct,
      plastic_share_pct: row.plastic_share_pct,
      estimated_lhv_low_mj_per_kg: row.estimated_lhv_low_food_unknown_zero_mj_per_kg,
      estimated_lhv_mixed_mj_per_kg: row.estimated_lhv_mixed_food_unknown_zero_mj_per_kg,
      existing_feedstock_risk_score_0_100: row.existing_feedstock_risk_score_0_100,
      risk_weighted_waste_tpd: round((toNumber(row.waste_generation_tpd) ?? 0) * ((toNumber(row.existing_feedstock_risk_score_0_100) ?? 0) / 100), 3),
      lhv_deficit_score_0_100: round(clamp(((12 - (low ?? 12)) / 4) * 100, 0, 100), 2),
    };
  });

  const loadScores = minMaxScores(rows.map((r) => ({ ...r, log_load: Math.log((toNumber(r.waste_generation_tpd) ?? 0) + 1) })), "log_load");
  rows.forEach((row, i) => {
    const risk = toNumber(row.existing_feedstock_risk_score_0_100) ?? 0;
    const load = loadScores[i] ?? 0;
    const lhvDeficit = toNumber(row.lhv_deficit_score_0_100) ?? 0;
    const unmanaged = (toNumber(row.unmanaged_waste_pct) ?? 0) * 100;
    const priority = 0.35 * risk + 0.3 * load + 0.2 * lhvDeficit + 0.15 * unmanaged;
    row.load_score_0_100 = round(load, 2);
    row.final_priority_score_0_100 = round(priority, 2);
    row.priority_class =
      priority >= 70
        ? "Tier 1: immediate RDF/pre-treatment screening"
        : priority >= 55
          ? "Tier 2: strong candidate for targeted waste-quality intervention"
          : priority >= 40
            ? "Tier 3: monitor and improve source separation"
            : "Tier 4: lower immediate priority";
  });

  return rows.sort((a, b) => toNumber(b.final_priority_score_0_100) - toNumber(a.final_priority_score_0_100));
}

function buildSingaporePanel(finalPanel) {
  const sgFinal = finalPanel.filter((r) => r.country === "Singapore");
  const wte = indexBy(parseCsv(readText("02_processed_data/singapore/singapore_nea_wte_electricity_generated_exported_fy2019_2024.csv")), (r) =>
    r.fiscal_year.replace("FY", ""),
  );
  const capacityRows = parseCsv(readText("02_processed_data/singapore/singapore_wte_facility_design_capacity_latest_2026-05-04.csv"));
  const totalCapacity = sum(capacityRows.map((r) => r.incineration_capacity_tonnes_per_day));
  const totalPower = sum(capacityRows.map((r) => r.power_capacity_mw));
  return sgFinal.map((row) => {
    const wr = wte.get(row.year) ?? {};
    const generated = toNumber(wr.electricity_generated_from_wte_mwh);
    const exported = toNumber(wr.electricity_exported_to_grid_mwh);
    return {
      country: "Singapore",
      year: row.year,
      composition_basis: row.composition_basis,
      final_risk_score_0_100: row.final_risk_score_0_100,
      best_available_lhv_mj_per_kg: row.best_available_lhv_mj_per_kg,
      lin2015_lhv_mj_per_kg: row.lin2015_eq26_lhv_mj_per_kg,
      relative_humidity_pct: row.relative_humidity_pct,
      precipitation_mm_total: row.precipitation_mm_total,
      fiscal_year_matched: wr.fiscal_year ?? "",
      nea_wte_generated_mwh: round(generated, 0),
      nea_wte_exported_mwh: round(exported, 0),
      exported_share_pct: generated ? round((exported / generated) * 100, 2) : "",
      public_wte_design_capacity_tpd_sum: totalCapacity,
      public_wte_power_capacity_mw_sum: totalPower,
      caveat: "NEA WTE electricity is a public operating proxy, not complete facility-level performance for all Singapore WTE plants.",
    };
  });
}

function buildKoreaSummary() {
  const reg = parseCsv(readText("05_analysis_results/models/korea_seoul_daily_regression_results.csv"));
  const pick = (model, variable) => reg.find((r) => r.model === model && r.variable === variable) ?? {};
  return [
    {
      evidence_block: "Seoul daily empirical proxy",
      sample: "28,075 Seoul municipality-day observations, 2021-01-01 to 2024-01-31",
      model: "D3 with municipality and year-month fixed effects plus weekday controls",
      variable: "temp_10c",
      approx_percent_change: pick("D3", "temp_10c").approx_percent_change,
      t_stat: pick("D3", "temp_10c").t_stat,
      interpretation: "Higher temperature is associated with higher food-waste discharge proxy; useful empirical support for weather-sensitive high-moisture waste-flow framing.",
    },
    {
      evidence_block: "Seoul daily empirical proxy",
      sample: "28,075 Seoul municipality-day observations, 2021-01-01 to 2024-01-31",
      model: "D3 with municipality and year-month fixed effects plus weekday controls",
      variable: "precipitation_10mm",
      approx_percent_change: pick("D3", "precipitation_10mm").approx_percent_change,
      t_stat: pick("D3", "precipitation_10mm").t_stat,
      interpretation: "Same-day rainfall is not a positive discharge-volume driver; weather risk should be framed as moisture/storage/LHV quality risk rather than immediate quantity increase.",
    },
    {
      evidence_block: "Korea LHV literature benchmark",
      sample: "Kwon 2017 and Bae 2024 facility-side LHV literature",
      model: "Facility heat-balance/reassessment formulas",
      variable: "LHV benchmark",
      approx_percent_change: "",
      t_stat: "",
      interpretation: "Use Korea literature as validation and method framing; direct facility operation variables are not available in the current dataset.",
    },
  ];
}

function writeDataCollectionVerification() {
  const rows = [
    {
      checked_date: "2026-05-05",
      source: "data.gov.sg Waste Management And Overall Recycling Rates, Annual",
      url: "https://data.gov.sg/datasets/d_daf568968ab40dc81e7b08887a83c8fa/view",
      finding: "Public data cover Jan 2000 to Dec 2024; page was crawled recently and shows last updated 15 Apr 2026, with data last updated 13 Aug 2025.",
      action: "No newer 2025 full-year Singapore waste table available from this public dataset; existing 2024 panel remains current.",
    },
    {
      checked_date: "2026-05-05",
      source: "SIPSN portal komposisi sampah",
      url: "https://portal-sipsn.kemenlh.go.id/data/komposisi-sampah",
      finding: "Public portal shows 2025 composition records and 269 visible total rows in the current table view.",
      action: "Existing local SIPSN 2025 composition/management files remain appropriate; cite portal status as current public source.",
    },
    {
      checked_date: "2026-05-05",
      source: "data.go.id SIPSN penanganan sampah dataset",
      url: "https://data.go.id/dataset/dataset/sipsn-penanganan-sampah",
      finding: "Dataset page published and modified 09 Apr 2026, but public page did not expose a straightforward machine-readable resource URL in the text view.",
      action: "Record as identified follow-up source; do not replace existing local SIPSN extraction without verified resource download.",
    },
    {
      checked_date: "2026-05-05",
      source: "NEA/EMA/Keppel Singapore WTE facility public sources",
      url: "https://www.nea.gov.sg/our-services/waste-management/waste-management-infrastructure/solid-waste-management-infrastructure",
      finding: "Facility names, design capacities, and recent TSIP/TuasOne context are public; plant-level throughput/LHV/moisture/downtime remain unavailable.",
      action: "Use Singapore as infrastructure-resilience contrast and official proxy case, not a plant-level performance regression case.",
    },
  ];
  writeProjectCsv("04_metadata_sources/additional_data_collection_verification_2026-05-05.csv", rows);
}

function barChart(rows, file, title, valueKey, labelKey, color = "#2563eb") {
  const width = 980;
  const barH = 30;
  const gap = 16;
  const left = 230;
  const top = 70;
  const max = Math.max(...rows.map((r) => toNumber(r[valueKey]) ?? 0));
  const height = top + rows.length * (barH + gap) + 45;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="24" y="36" font-family="Arial" font-size="22" font-weight="700" fill="#111827">${title}</text>`,
  ];
  rows.forEach((row, i) => {
    const y = top + i * (barH + gap);
    const v = toNumber(row[valueKey]) ?? 0;
    const w = max > 0 ? (v / max) * (width - left - 120) : 0;
    svg.push(`<text x="24" y="${y + 21}" font-family="Arial" font-size="14" fill="#111827">${row[labelKey]}</text>`);
    svg.push(`<rect x="${left}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}"/>`);
    svg.push(`<text x="${left + w + 8}" y="${y + 21}" font-family="Arial" font-size="14" fill="#111827">${round(v, 2)}</text>`);
  });
  svg.push(`</svg>`);
  ensureDir(path.dirname(out(file)));
  fs.writeFileSync(out(file), svg.join("\n"), "utf8");
}

function scatter(panel, file) {
  const rows = panel.filter((r) => toNumber(r.best_available_lhv_mj_per_kg) !== null);
  const width = 900;
  const height = 560;
  const margin = { left: 70, right: 30, top: 60, bottom: 70 };
  const xs = rows.map((r) => toNumber(r.best_available_lhv_mj_per_kg));
  const ys = rows.map((r) => toNumber(r.final_risk_score_0_100));
  const xmin = Math.floor(Math.min(...xs) - 0.5);
  const xmax = Math.ceil(Math.max(...xs) + 0.5);
  const ymin = 0;
  const ymax = 100;
  const x = (v) => margin.left + ((v - xmin) / (xmax - xmin)) * (width - margin.left - margin.right);
  const y = (v) => height - margin.bottom - ((v - ymin) / (ymax - ymin)) * (height - margin.top - margin.bottom);
  const colors = { Indonesia: "#dc2626", Singapore: "#059669", "South Korea": "#2563eb" };
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="24" y="34" font-family="Arial" font-size="22" font-weight="700" fill="#111827">Risk score vs best available LHV scenario</text>`,
    `<line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#111827"/>`,
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#111827"/>`,
    `<text x="${width / 2 - 90}" y="${height - 22}" font-family="Arial" font-size="14" fill="#111827">Best available LHV (MJ/kg)</text>`,
    `<text transform="translate(18 ${height / 2 + 95}) rotate(-90)" font-family="Arial" font-size="14" fill="#111827">Final feedstock-risk score (0-100)</text>`,
  ];
  for (let tick = xmin; tick <= xmax; tick += 1) {
    svg.push(`<line x1="${x(tick)}" y1="${height - margin.bottom}" x2="${x(tick)}" y2="${height - margin.bottom + 5}" stroke="#111827"/>`);
    svg.push(`<text x="${x(tick) - 8}" y="${height - margin.bottom + 22}" font-family="Arial" font-size="12" fill="#374151">${tick}</text>`);
  }
  for (let tick = 0; tick <= 100; tick += 20) {
    svg.push(`<line x1="${margin.left - 5}" y1="${y(tick)}" x2="${margin.left}" y2="${y(tick)}" stroke="#111827"/>`);
    svg.push(`<text x="${margin.left - 38}" y="${y(tick) + 4}" font-family="Arial" font-size="12" fill="#374151">${tick}</text>`);
    if (tick > 0 && tick < 100) svg.push(`<line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" stroke="#e5e7eb"/>`);
  }
  for (const row of rows) {
    const cx = x(toNumber(row.best_available_lhv_mj_per_kg));
    const cy = y(toNumber(row.final_risk_score_0_100));
    svg.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="${colors[row.country] ?? "#111827"}" opacity="0.85"/>`);
    if (row.year === "2025" || row.year === "2024" || row.final_risk_level === "High") {
      svg.push(`<text x="${cx + 8}" y="${cy - 8}" font-family="Arial" font-size="11" fill="#111827">${row.country.replace("South Korea", "Korea")} ${row.year}</text>`);
    }
  }
  let lx = width - 250;
  let ly = 78;
  Object.entries(colors).forEach(([label, c], idx) => {
    svg.push(`<circle cx="${lx}" cy="${ly + idx * 22}" r="6" fill="${c}"/>`);
    svg.push(`<text x="${lx + 12}" y="${ly + idx * 22 + 4}" font-family="Arial" font-size="13" fill="#111827">${label}</text>`);
  });
  svg.push(`</svg>`);
  ensureDir(path.dirname(out(file)));
  fs.writeFileSync(out(file), svg.join("\n"), "utf8");
}

function buildReport(finalPanel, summary, indonesiaPriority, singaporePanel, koreaSummary) {
  const topCountry = summary[0];
  const topYear = [...finalPanel].sort((a, b) => toNumber(b.final_risk_score_0_100) - toNumber(a.final_risk_score_0_100))[0];
  const sgMean = summary.find((r) => r.country === "Singapore");
  const idMean = summary.find((r) => r.country === "Indonesia");
  const korea = summary.find((r) => r.country === "South Korea");
  const topMunicipal = indonesiaPriority[0];
  const sgLatest = singaporePanel.find((r) => r.year === "2024") ?? singaporePanel.at(-1);
  const tempRow = koreaSummary.find((r) => r.variable === "temp_10c");
  const rainRow = koreaSummary.find((r) => r.variable === "precipitation_10mm");

  return `# 최종 통합 분석 보고서

작성일: 2026-05-05

## 1. 최종 연구 프레임

현재 데이터로 가장 타당한 연구 프레임은 **Weather-informed WtE feedstock quality risk assessment and literature-calibrated LHV scenario analysis**입니다. 직접 실측 수분함량/LHV 시계열이 없기 때문에, 이 연구를 “검증 완료된 LHV 예측모형”으로 주장하지 않고 “기상-조성 기반 원료품질 위험 선별과 문헌 보정 LHV 시나리오”로 위치시켰습니다.

## 2. 추가 데이터 확인 결과

- 싱가포르 data.gov.sg 폐기물 통계는 2024년까지가 최신 공개 연도입니다.
- SIPSN 공개 포털은 2025년 조성자료를 제공하며 현재 표에서 269개 행이 확인됩니다.
- data.go.id에는 2026년 4월 9일 게시/수정된 SIPSN 처리자료 페이지가 있으나, 텍스트 접근에서 바로 검증 가능한 원자료 다운로드 URL은 확인되지 않았습니다.
- 싱가포르 WTE 시설별 반입량, LHV, 수분함량, downtime이 결합된 공개 운영자료는 여전히 확보되지 않았습니다.

정리 파일: \`04_metadata_sources/additional_data_collection_verification_2026-05-05.csv\`

## 3. 핵심 결과

### 3개국 최종 위험도

- 평균 위험점수가 가장 높은 국가는 **${topCountry.country}**이며 평균 **${topCountry.mean_risk_score_0_100}점**입니다.
- 단일 국가-연도 기준 최고 위험은 **${topYear.country} ${topYear.year}년**, **${topYear.final_risk_score_0_100}점(${topYear.final_risk_level})**입니다.
- 인도네시아 평균 위험점수는 **${idMean.mean_risk_score_0_100}점**, 평균 best available LHV 시나리오는 **${idMean.mean_best_available_lhv_mj_per_kg} MJ/kg**입니다.
- 싱가포르는 disposed 기준으로 보정한 뒤 평균 위험점수 **${sgMean.mean_risk_score_0_100}점**, 평균 LHV 시나리오 **${sgMean.mean_best_available_lhv_mj_per_kg} MJ/kg**입니다.
- 한국은 평균 위험점수 **${korea.mean_risk_score_0_100}점**이나, LHV는 조성식이 아니라 Kwon/Bae 문헌 시설 benchmark로 해석해야 합니다.

### 한국 일별 실증

서울 일별 RFID 분석은 직접 LHV를 측정하지는 않지만, 날씨와 고수분 폐기물 흐름이 연결될 수 있음을 보여주는 실증 보강입니다.

- D3 모형에서 기온 10도 상승은 음식물쓰레기 배출 프록시 약 **${tempRow.approx_percent_change}%** 변화와 연결됩니다.
- 같은 모형에서 강수량 10 mm 효과는 **${rainRow.approx_percent_change}%**로 작고 음의 방향입니다.
- 따라서 날씨 효과는 “비가 오면 당일 배출량이 증가한다”보다, 고온/다습 조건의 보관, 부패, 악취, 수분, LHV 저하 위험으로 해석하는 것이 타당합니다.

### 인도네시아 지자체 우선순위

인도네시아는 전국 평균보다 지자체별 격차가 핵심입니다. 최종 우선순위 지수는 기존 feedstock risk, 폐기물 발생량, LHV deficit, 미관리율을 결합했습니다.

- 최우선 후보는 **${topMunicipal.province} - ${topMunicipal.municipality}**입니다.
- 이 지역의 최종 우선순위 점수는 **${topMunicipal.final_priority_score_0_100}점**이고, 위험가중 폐기물 부하는 **${topMunicipal.risk_weighted_waste_tpd} t/day**입니다.
- 이 결과는 WtE 단독 추진보다 음식물류 분리, 전처리, RDF 품질관리, 수거체계 개선을 먼저 검토해야 함을 시사합니다.

### 싱가포르 보강 분석

싱가포르는 generated 기준보다 disposed 기준 조성이 WTE 반입 프록시에 더 가깝습니다. 최종 분석에서는 disposed 조성과 Changi/S24 공식 습도를 사용했습니다.

- ${sgLatest.year}년 싱가포르 best available LHV 시나리오는 **${sgLatest.best_available_lhv_mj_per_kg} MJ/kg**입니다.
- 같은 해 최종 위험점수는 **${sgLatest.final_risk_score_0_100}점**입니다.
- NEA WTE 전력 프록시는 FY2024 기준 발전 **${sgLatest.nea_wte_generated_mwh} MWh**, 수출 **${sgLatest.nea_wte_exported_mwh} MWh**입니다.
- 다만 이 값은 전체 시설별 성능자료가 아니라 NEA 보고서 기반 운영 프록시입니다.

## 4. 최종 분석 산출물

- \`tables/final_country_year_risk_lhv_panel.csv\`
- \`tables/final_country_summary.csv\`
- \`tables/final_indonesia_municipal_priority_top50.csv\`
- \`tables/final_singapore_weather_lhv_wte_panel.csv\`
- \`tables/final_korea_empirical_summary.csv\`
- \`figures/final_country_mean_risk.svg\`
- \`figures/final_risk_vs_lhv_scatter.svg\`
- \`figures/final_indonesia_top_priority.svg\`

## 5. 논문/제안서에 넣을 수 있는 주장

넣어도 되는 주장:

1. 폐기물 조성과 기상 조건을 결합하면 WtE 원료 품질 위험 선별이 가능하다.
2. 인도네시아는 고수분 유기성 조성, 습윤 기후, 관리 미흡이 겹쳐 가장 강한 전처리/RDF 필요 사례다.
3. 서울 일별 자료는 날씨와 고수분 폐기물 흐름의 관련성을 보여주는 실증 프록시다.
4. 싱가포르는 강한 WTE 인프라와 낮은 disposed 기준 음식물 비중 때문에 비교적 안정적인 대조 사례다.
5. Wang/Lin/Kumar/Kwon/Bae 문헌식을 통해 위험지수를 LHV 시나리오로 번역할 수 있다.

넣으면 위험한 주장:

1. 날씨만으로 실제 MSW 수분함량을 정확히 예측했다.
2. 국가별 실제 WTE 투입 폐기물 LHV를 실측했다.
3. 싱가포르 시설별 발전효율을 회귀분석했다.
4. 서울 음식물쓰레기 배출량 변화가 곧 WTE LHV 변화라고 증명했다.

## 6. 최종 결론

현재 자료로 가장 강한 결론은 다음입니다.

> WtE 계획에서 생활폐기물을 균질한 연료로 가정하면 위험하다. 특히 고수분 유기성 조성과 습윤 기후가 결합되는 지역에서는 소각시설 투자 이전에 원료품질 위험 선별, 음식물류 분리, 저장/건조, RDF 전처리, 시설별 품질검증이 필요하다.

이 결론은 현재 데이터로 충분히 방어 가능합니다. 다만 직접 수분함량/LHV 실측자료가 없으므로 결과는 예측 확정값이 아니라 의사결정 지원용 위험 선별 및 문헌 보정 시나리오로 제시해야 합니다.
`;
}

function writeReadme() {
  writeMarkdown(
    "README.md",
    `# Final Integrated Analysis - 2026-05-05

This folder contains the final integrated WtE feedstock-quality analysis prepared on 2026-05-05.

## Main Brief

- \`briefs/final_integrated_analysis_report_ko.md\`

## Tables

- \`tables/final_country_year_risk_lhv_panel.csv\`
- \`tables/final_country_summary.csv\`
- \`tables/final_indonesia_municipal_priority_top50.csv\`
- \`tables/final_singapore_weather_lhv_wte_panel.csv\`
- \`tables/final_korea_empirical_summary.csv\`

## Figures

- \`figures/final_country_mean_risk.svg\`
- \`figures/final_risk_vs_lhv_scatter.svg\`
- \`figures/final_indonesia_top_priority.svg\`

## Positioning

Use this as a weather-informed feedstock-quality risk and literature-calibrated LHV scenario analysis. Do not describe it as a fully validated direct LHV/moisture prediction model.
`,
  );
}

function main() {
  ensureDir(OUT);
  writeDataCollectionVerification();

  const finalPanel = buildFinalCountryPanel();
  const summary = buildCountrySummary(finalPanel);
  const indonesiaPriority = buildIndonesiaPriority();
  const singaporePanel = buildSingaporePanel(finalPanel);
  const koreaSummary = buildKoreaSummary();

  writeCsv("tables/final_country_year_risk_lhv_panel.csv", finalPanel);
  writeCsv("tables/final_country_summary.csv", summary);
  writeCsv("tables/final_indonesia_municipal_priority_top50.csv", indonesiaPriority.slice(0, 50));
  writeCsv("tables/final_singapore_weather_lhv_wte_panel.csv", singaporePanel);
  writeCsv("tables/final_korea_empirical_summary.csv", koreaSummary);

  barChart(
    summary.map((r) => ({ ...r, label: r.country })),
    "figures/final_country_mean_risk.svg",
    "Mean final feedstock-risk score by country",
    "mean_risk_score_0_100",
    "label",
    "#2563eb",
  );
  scatter(finalPanel, "figures/final_risk_vs_lhv_scatter.svg");
  barChart(
    indonesiaPriority.slice(0, 15).map((r) => ({ ...r, label: `${r.province} - ${r.municipality}` })),
    "figures/final_indonesia_top_priority.svg",
    "Indonesia final municipal WtE/RDF intervention priority",
    "final_priority_score_0_100",
    "label",
    "#dc2626",
  );

  writeMarkdown("briefs/final_integrated_analysis_report_ko.md", buildReport(finalPanel, summary, indonesiaPriority, singaporePanel, koreaSummary));
  writeReadme();

  console.log(`Final integrated analysis written to ${OUT}`);
  console.log(`Rows: final panel ${finalPanel.length}, Indonesia priority ${indonesiaPriority.length}, Singapore panel ${singaporePanel.length}`);
}

main();
