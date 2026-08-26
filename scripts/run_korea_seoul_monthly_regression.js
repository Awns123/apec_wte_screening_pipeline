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

function round(value, digits = 4) {
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

function mean(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return 0;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function residualizeTwoWay(values, entityIds, seasonIds, iterations = 30) {
  const residuals = values.slice();
  for (let iter = 0; iter < iterations; iter += 1) {
    subtractGroupMeans(residuals, entityIds);
    subtractGroupMeans(residuals, seasonIds);
  }
  return residuals;
}

function subtractGroupMeans(values, groups) {
  const sums = new Map();
  const counts = new Map();
  for (let i = 0; i < values.length; i += 1) {
    const key = groups[i];
    sums.set(key, (sums.get(key) ?? 0) + values[i]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const means = new Map([...sums.entries()].map(([key, sum]) => [key, sum / counts.get(key)]));
  for (let i = 0; i < values.length; i += 1) values[i] -= means.get(groups[i]);
}

function transpose(matrix) {
  return matrix[0].map((_, col) => matrix.map((row) => row[col]));
}

function multiply(a, b) {
  const out = Array.from({ length: a.length }, () => Array(b[0].length).fill(0));
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < b.length; k += 1) {
      for (let j = 0; j < b[0].length; j += 1) out[i][j] += a[i][k] * b[k][j];
    }
  }
  return out;
}

function inverse(matrix) {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) throw new Error("Singular matrix");
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    for (let j = 0; j < 2 * n; j += 1) aug[col][j] /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j += 1) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n));
}

function olsNoIntercept(y, x, variableNames) {
  const xt = transpose(x);
  const xtx = multiply(xt, x);
  const xtxInv = inverse(xtx);
  const xty = multiply(xt, y.map((v) => [v]));
  const beta = multiply(xtxInv, xty).map((row) => row[0]);
  const fitted = x.map((row) => row.reduce((sum, value, index) => sum + value * beta[index], 0));
  const residuals = y.map((value, index) => value - fitted[index]);
  const n = y.length;
  const k = variableNames.length;
  const sse = residuals.reduce((sum, v) => sum + v * v, 0);
  const tss = y.reduce((sum, v) => sum + v * v, 0);
  const sigma2 = sse / (n - k);
  const vcov = xtxInv.map((row) => row.map((value) => value * sigma2));
  const rows = variableNames.map((name, index) => {
    const se = Math.sqrt(vcov[index][index]);
    const coef = beta[index];
    return {
      variable: name,
      coefficient_log_points: round(coef, 5),
      approx_percent_change: round((Math.exp(coef) - 1) * 100, 3),
      standard_error: round(se, 5),
      t_stat: round(coef / se, 3),
    };
  });
  return {
    rows,
    diagnostics: {
      n,
      k,
      r_squared_within: round(1 - sse / tss, 4),
      residual_std_error: round(Math.sqrt(sigma2), 5),
    },
  };
}

function buildPanel(foodWasteRows, weatherRows) {
  const weather = new Map(weatherRows.map((row) => [row.date_month, row]));
  return foodWasteRows
    .map((row) => {
      const w = weather.get(row.date_month);
      if (!w) return null;
      return {
        date_month: row.date_month,
        year: row.year,
        month: row.month,
        province: row.province,
        municipality: row.municipality,
        municipality_id: `${row.province}|${row.municipality}`,
        food_waste_discharge_raw_value: row.food_waste_discharge_raw_value,
        food_waste_tonnes_if_raw_is_kg: row.food_waste_tonnes_if_raw_is_kg,
        temp_mean_c: w.temp_mean_c,
        relative_humidity_est_pct: w.relative_humidity_est_pct,
        precipitation_mm_total: w.precipitation_mm_total,
        precipitation_days: w.precipitation_days,
        wind_mean_mps: w.wind_mean_mps,
        weather_proxy_note: "Seoul GSOD monthly weather joined by month; strongest interpretation for Seoul municipalities",
      };
    })
    .filter(Boolean);
}

function runSeoulRegression(panel) {
  const rows = panel
    .filter((row) => row.province === "서울특별시")
    .filter((row) => toNumber(row.food_waste_tonnes_if_raw_is_kg) !== null)
    .filter((row) => toNumber(row.precipitation_mm_total) !== null)
    .filter((row) => toNumber(row.relative_humidity_est_pct) !== null)
    .filter((row) => toNumber(row.temp_mean_c) !== null);

  const entityIds = rows.map((row) => row.municipality);
  const seasonIds = rows.map((row) => row.month);
  const yRaw = rows.map((row) => Math.log(toNumber(row.food_waste_tonnes_if_raw_is_kg) + 1));

  const vars = {
    rainfall_100mm: rows.map((row) => toNumber(row.precipitation_mm_total) / 100),
    rainy_days_10: rows.map((row) => toNumber(row.precipitation_days) / 10),
    humidity_10pct: rows.map((row) => toNumber(row.relative_humidity_est_pct) / 10),
    temp_10c: rows.map((row) => toNumber(row.temp_mean_c) / 10),
  };

  const y = residualizeTwoWay(yRaw, entityIds, seasonIds);

  const modelSpecs = [
    ["rainfall_100mm", "humidity_10pct", "temp_10c"],
    ["rainfall_100mm", "rainy_days_10", "humidity_10pct", "temp_10c"],
  ];

  const results = [];
  const diagnostics = [];
  modelSpecs.forEach((spec, modelIndex) => {
    const x = rows.map((_, rowIndex) =>
      spec.map((name) => residualizeTwoWay(vars[name], entityIds, seasonIds)[rowIndex]),
    );
    const model = olsNoIntercept(y, x, spec);
    for (const result of model.rows) {
      results.push({
        model: `M${modelIndex + 1}`,
        dependent_variable: "log(food_waste_tonnes_proxy + 1)",
        fixed_effects: "municipality and calendar-month",
        sample: "Seoul municipalities, monthly 2017-07 to 2020-07",
        ...result,
      });
    }
    diagnostics.push({
      model: `M${modelIndex + 1}`,
      dependent_variable: "log(food_waste_tonnes_proxy + 1)",
      fixed_effects: "municipality and calendar-month",
      sample_rows: model.diagnostics.n,
      variables: spec.join("; "),
      r_squared_within: model.diagnostics.r_squared_within,
      residual_std_error: model.diagnostics.residual_std_error,
    });
  });

  return { rows, results, diagnostics };
}

function summarizePanel(panel, seoulRows, results, diagnostics) {
  const months = [...new Set(panel.map((row) => row.date_month))].sort();
  const municipalities = new Set(panel.map((row) => row.municipality_id));
  const seoulMunicipalities = new Set(seoulRows.map((row) => row.municipality));
  const mainRain = results.find((row) => row.model === "M1" && row.variable === "rainfall_100mm");
  const mainHumidity = results.find((row) => row.model === "M1" && row.variable === "humidity_10pct");
  const mainTemp = results.find((row) => row.model === "M1" && row.variable === "temp_10c");

  return `# Korea Seoul Monthly Fixed-Effects Pilot

Generated: 2026-05-02

## Data

- Full joined Korea municipality-month panel rows: ${panel.length}
- Full panel municipalities: ${municipalities.size}
- Month coverage: ${months[0]} to ${months.at(-1)}
- Regression sample: Seoul municipalities only
- Seoul regression rows: ${seoulRows.length}
- Seoul municipalities: ${seoulMunicipalities.size}

## Main Model

Dependent variable: \`log(food_waste_tonnes_proxy + 1)\`

Fixed effects: municipality and calendar-month. Weather variables are scaled for readability.

| Variable | Coefficient | Approx. percent change | t-stat |
| --- | ---: | ---: | ---: |
| Rainfall, per 100 mm | ${mainRain?.coefficient_log_points ?? ""} | ${mainRain?.approx_percent_change ?? ""}% | ${mainRain?.t_stat ?? ""} |
| Relative humidity, per 10 pct points | ${mainHumidity?.coefficient_log_points ?? ""} | ${mainHumidity?.approx_percent_change ?? ""}% | ${mainHumidity?.t_stat ?? ""} |
| Mean temperature, per 10 C | ${mainTemp?.coefficient_log_points ?? ""} | ${mainTemp?.approx_percent_change ?? ""}% | ${mainTemp?.t_stat ?? ""} |

Within R-squared for M1: ${diagnostics.find((row) => row.model === "M1")?.r_squared_within}

## Interpretation

This is a pilot association model. It supports the report narrative if weather coefficients are directionally plausible, but it should not be presented as causal. The current food-waste unit has an unresolved source-label caution, so use it as a high-moisture waste-flow proxy rather than a finalized tonnage claim.
`;
}

function main() {
  const foodWasteRows = parseCsv(readText("02_processed_data/korea/KECO_RFID_food_waste_monthly_municipality_2017_2020_normalized.csv"));
  const weatherRows = parseCsv(readText("02_processed_data/weather/korea_weather_seoul_gsod_monthly_2017_2024.csv"));
  const panel = buildPanel(foodWasteRows, weatherRows);
  writeCsv("02_processed_data/korea/korea_municipality_monthly_weather_food_waste_panel_2017_2020.csv", panel);

  const { rows: seoulRows, results, diagnostics } = runSeoulRegression(panel);
  writeCsv("03_analysis_outputs/regressions/korea_seoul_monthly_fe_regression_results.csv", results);
  writeCsv("03_analysis_outputs/regressions/korea_seoul_monthly_fe_regression_diagnostics.csv", diagnostics);
  fs.writeFileSync(
    projectPath("03_analysis_outputs/regressions/korea_seoul_monthly_fe_regression_summary.md"),
    summarizePanel(panel, seoulRows, results, diagnostics),
    "utf8",
  );

  console.log(`panel_rows=${panel.length}`);
  console.log(`seoul_regression_rows=${seoulRows.length}`);
  console.log(`regression_result_rows=${results.length}`);
}

main();
