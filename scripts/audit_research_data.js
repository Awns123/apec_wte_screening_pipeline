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

function unique(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean));
}

function minMax(rows, key) {
  const values = rows.map((row) => row[key]).filter(Boolean).sort();
  return {
    min: values[0] ?? "",
    max: values.at(-1) ?? "",
  };
}

function countMissing(rows, key) {
  return rows.filter((row) => row[key] === "" || row[key] === null || row[key] === undefined).length;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text.includes(",") || text.includes('"') || text.includes("\n")
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function writeCsv(file, rows) {
  const headers = Object.keys(rows[0] ?? {});
  fs.mkdirSync(path.dirname(projectPath(file)), { recursive: true });
  fs.writeFileSync(
    projectPath(file),
    [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n"),
    "utf8",
  );
}

function fileMeta(file) {
  const stat = fs.statSync(projectPath(file));
  return { bytes: stat.size, modified: stat.mtime.toISOString() };
}

function auditFile(file, opts = {}) {
  const rows = parseCsv(readText(file));
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const dateKey = opts.dateKey;
  const yearKey = opts.yearKey ?? "year";
  const countryKey = opts.countryKey ?? "country";
  const provinceKey = opts.provinceKey ?? "province";
  const municipalityKey = opts.municipalityKey ?? "municipality";
  const dateRange = dateKey ? minMax(rows, dateKey) : { min: "", max: "" };
  const yearValues = unique(rows, yearKey);
  const meta = fileMeta(file);
  return {
    file,
    rows: rows.length,
    columns: headers.length,
    bytes: meta.bytes,
    country_count: unique(rows, countryKey).size || "",
    province_count: unique(rows, provinceKey).size || "",
    municipality_count: unique(rows, municipalityKey).size || "",
    year_min: [...yearValues].sort()[0] ?? "",
    year_max: [...yearValues].sort().at(-1) ?? "",
    date_min: dateRange.min,
    date_max: dateRange.max,
    key_missing_summary: (opts.required ?? [])
      .map((key) => `${key}:${countMissing(rows, key)}`)
      .join("; "),
    notes: opts.notes ?? "",
  };
}

function groupSum(rows, groupKey, valueKey) {
  const out = new Map();
  for (const row of rows) {
    const key = row[groupKey];
    out.set(key, (out.get(key) ?? 0) + (toNumber(row[valueKey]) ?? 0));
  }
  return [...out.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));
}

function buildDetailedFindings() {
  const findings = [];

  const panel = parseCsv(readText("02_processed_data/panels/combined_country_summary_three_country_with_weather.csv"));
  findings.push({
    area: "3-country annual panel",
    finding: `Panel has ${panel.length} rows: ${[...unique(panel, "country")].join(", ")}.`,
    implication: "Ready for baseline comparison and draft country-year risk index.",
  });
  findings.push({
    area: "3-country annual panel",
    finding: `Missing paper/plastic composition rows: paper ${countMissing(panel, "paper_waste_share_pct")}, plastic ${countMissing(panel, "plastic_waste_share_pct")}.`,
    implication: "Korea and some Singapore years still need composition assumptions or sensitivity analysis.",
  });

  const risk = parseCsv(readText("03_analysis_outputs/risk_index/fuel_quality_risk_index_country_year_draft.csv"));
  const topRisk = risk
    .slice()
    .sort((a, b) => (toNumber(b.fuel_quality_risk_score_0_100) ?? 0) - (toNumber(a.fuel_quality_risk_score_0_100) ?? 0))
    .slice(0, 3)
    .map((row) => `${row.country} ${row.year} (${row.fuel_quality_risk_score_0_100})`)
    .join(", ");
  findings.push({
    area: "Risk index",
    finding: `Top risk rows: ${topRisk}.`,
    implication: "Indonesia remains the clearest cross-country high-risk case.",
  });

  const sipsn = parseCsv(readText("02_processed_data/indonesia/indonesia_sipsn_2025_waste_management_composition_joined.csv"));
  const matched = sipsn.filter((row) => row.composition_match === "matched");
  findings.push({
    area: "Indonesia SIPSN",
    finding: `${matched.length}/${sipsn.length} SIPSN management rows matched to uploaded composition rows.`,
    implication: "Good for matched-municipality analysis; national claims should mention partial composition coverage.",
  });
  const highRiskMunicipalities = matched.filter((row) => row.municipality_feedstock_risk_level === "High").length;
  findings.push({
    area: "Indonesia SIPSN",
    finding: `${highRiskMunicipalities} matched municipalities are High risk in the draft municipal screening index.`,
    implication: "Useful for maps/rankings and case selection, but not a calibrated LHV prediction.",
  });

  const rfidDaily = parseCsv(readText("02_processed_data/korea/korea_rfid_daily_food_waste_2021_2024_normalized.csv"));
  const byYear = groupSum(rfidDaily, "year", "food_waste_discharge_tonnes")
    .map(([year, tonnes]) => `${year}: ${round(tonnes, 1)} t`)
    .join("; ");
  findings.push({
    area: "Korea RFID daily",
    finding: `RFID daily file has ${rfidDaily.length} municipality-day rows; annual sums are ${byYear}.`,
    implication: "2021-2023 are full years; 2024 is January only and should not be treated as a full annual value.",
  });

  const seoulDaily = parseCsv(readText("02_processed_data/korea/korea_seoul_rfid_daily_weather_food_waste_2021_2024.csv"));
  findings.push({
    area: "Korea Seoul daily weather join",
    finding: `${countMissing(seoulDaily, "temp_mean_c")} rows lack temp/humidity; ${countMissing(seoulDaily, "precipitation_mm")} rows have blank precipitation, treated as zero in the daily regression.`,
    implication: "Daily regression is usable; precipitation source handling should be documented.",
  });

  const sgWeather = parseCsv(readText("02_processed_data/singapore/singapore_changi_official_monthly_weather_2020_2025.csv"));
  const sgYears = groupSum(sgWeather, "year", "precipitation_mm_total")
    .map(([year, rain]) => `${year}: ${round(rain, 1)} mm`)
    .join("; ");
  findings.push({
    area: "Singapore weather",
    finding: `Official Changi monthly data are available for 2020-2025 rainfall/temp/wind. Annual rainfall totals: ${sgYears}.`,
    implication: "Singapore humidity remains missing except for climate normals or NASA proxy unless data.gov.sg historical humidity is sampled with an API key.",
  });

  return findings;
}

function buildMarkdown(auditRows, findings) {
  const auditTable = auditRows
    .map(
      (row) =>
        `| ${row.file} | ${row.rows} | ${row.year_min}-${row.year_max} | ${row.date_min || ""} to ${row.date_max || ""} | ${row.key_missing_summary || ""} |`,
    )
    .join("\n");
  const findingBullets = findings
    .map((row) => `- **${row.area}:** ${row.finding} ${row.implication}`)
    .join("\n");

  return `# Research Data Quality Audit

Generated: 2026-05-02

## Key File Audit

| File | Rows | Years | Dates | Missingness checks |
| --- | ---: | --- | --- | --- |
${auditTable}

## Findings

${findingBullets}

## Data Readiness

- **Ready now:** country-year comparison, draft fuel-quality risk index, Indonesia municipal risk screening, Korea Seoul daily weather-food-waste association.
- **Usable with caveats:** Korea national food/composition risk for non-2022 years, Indonesia composition for unmatched municipalities, Singapore humidity using NASA proxy/climate normals.
- **Still weak:** direct measured moisture/LHV time series and WtE facility operating outcomes.
`;
}

function main() {
  const auditRows = [
    auditFile("02_processed_data/panels/combined_country_summary_three_country_with_weather.csv", {
      required: ["food_waste_share_pct", "paper_waste_share_pct", "plastic_waste_share_pct", "weather_precipitation_mm_total"],
      notes: "Main country-year comparison panel",
    }),
    auditFile("03_analysis_outputs/risk_index/fuel_quality_risk_index_country_year_draft.csv", {
      required: ["fuel_quality_risk_score_0_100", "data_quality_score_0_100"],
      notes: "Draft country-year risk index",
    }),
    auditFile("02_processed_data/indonesia/indonesia_sipsn_2025_waste_management_composition_joined.csv", {
      required: ["food_waste_share_pct", "paper_plastic_share_pct", "municipality_feedstock_risk_score_0_100"],
      notes: "Indonesia municipal composition + management join",
    }),
    auditFile("02_processed_data/korea/korea_rfid_daily_food_waste_2021_2024_normalized.csv", {
      dateKey: "date",
      required: ["food_waste_discharge_tonnes", "discharge_count"],
      notes: "Korea RFID daily municipality food-waste data",
    }),
    auditFile("02_processed_data/korea/korea_seoul_rfid_daily_weather_food_waste_2021_2024.csv", {
      dateKey: "date",
      required: ["food_waste_discharge_tonnes", "temp_mean_c", "relative_humidity_est_pct", "precipitation_mm"],
      notes: "Seoul daily RFID + weather join",
    }),
    auditFile("02_processed_data/singapore/singapore_changi_official_monthly_weather_2020_2025.csv", {
      dateKey: "date_month",
      required: ["precipitation_mm_total", "temp_mean_c"],
      notes: "Official Singapore Changi weather monthly",
    }),
    auditFile("02_processed_data/weather/nasa_power_monthly_weather_country_proxies_2017_2025.csv", {
      dateKey: "date_month",
      required: ["relative_humidity_pct", "precipitation_mm_total", "temp_mean_c"],
      notes: "Comparable proxy weather across countries",
    }),
    auditFile("04_metadata_sources/fuel_quality_calibration_sources.csv", {
      required: ["lhv_mj_kg", "moisture_pct"],
      notes: "Literature calibration sources",
    }),
  ];
  const findings = buildDetailedFindings();
  writeCsv("03_analysis_outputs/audits/data_quality_audit_2026-05-02.csv", auditRows);
  writeCsv("03_analysis_outputs/audits/data_quality_findings_2026-05-02.csv", findings);
  fs.writeFileSync(
    projectPath("03_analysis_outputs/audits/data_quality_audit_2026-05-02.md"),
    buildMarkdown(auditRows, findings),
    "utf8",
  );
  console.log(`audit_rows=${auditRows.length}`);
  console.log(`finding_rows=${findings.length}`);
}

main();
