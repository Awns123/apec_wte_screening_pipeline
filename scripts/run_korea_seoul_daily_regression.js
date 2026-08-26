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
  const headers = rows.shift();
  return rows
    .filter((r) => r.some((cell) => cell !== ""))
    .map((r) => Object.fromEntries(headers.map((header, index) => [header, r[index] ?? ""])));
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

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return Number(value.toFixed(digits));
}

function subtractGroupMeans(values, groups) {
  const sums = new Map();
  const counts = new Map();
  for (let i = 0; i < values.length; i += 1) {
    const key = groups[i];
    sums.set(key, (sums.get(key) ?? 0) + values[i]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (let i = 0; i < values.length; i += 1) values[i] -= sums.get(groups[i]) / counts.get(groups[i]);
}

function residualizeTwoWay(values, entityIds, timeIds, iterations = 40) {
  const residuals = values.slice();
  for (let i = 0; i < iterations; i += 1) {
    subtractGroupMeans(residuals, entityIds);
    subtractGroupMeans(residuals, timeIds);
  }
  return residuals;
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
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) throw new Error("Singular matrix");
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    for (let j = 0; j < 2 * n; j += 1) aug[col][j] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let j = 0; j < 2 * n; j += 1) aug[r][j] -= factor * aug[col][j];
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
  return {
    rows: variableNames.map((name, index) => {
      const se = Math.sqrt(vcov[index][index]);
      const coef = beta[index];
      return {
        variable: name,
        coefficient_log_points: round(coef, 5),
        approx_percent_change: round((Math.exp(coef) - 1) * 100, 3),
        standard_error: round(se, 5),
        t_stat: round(coef / se, 3),
      };
    }),
    diagnostics: {
      n,
      k,
      r_squared_within: round(1 - sse / tss, 4),
      residual_std_error: round(Math.sqrt(sigma2), 5),
    },
  };
}

function dayOfWeek(dateText) {
  return new Date(`${dateText}T00:00:00Z`).getUTCDay();
}

function summarizeDailyTotals(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.date)) {
      map.set(row.date, {
        date: row.date,
        year: row.year,
        month: row.month,
        date_month: row.date.slice(0, 7) + "-01",
        municipalities_count: 0,
        food_waste_discharge_tonnes_sum: 0,
        discharge_count_sum: 0,
        temp_mean_c: row.temp_mean_c,
        relative_humidity_est_pct: row.relative_humidity_est_pct,
        precipitation_mm: row.precipitation_mm,
        flag_rain: row.flag_rain,
      });
    }
    const target = map.get(row.date);
    target.municipalities_count += 1;
    target.food_waste_discharge_tonnes_sum += toNumber(row.food_waste_discharge_tonnes) ?? 0;
    target.discharge_count_sum += toNumber(row.discharge_count) ?? 0;
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      food_waste_discharge_tonnes_sum: round(row.food_waste_discharge_tonnes_sum, 3),
      discharge_count_sum: round(row.discharge_count_sum, 0),
    }));
}

function runRegression(rows) {
  const sample = rows.filter((row) =>
    [
      row.food_waste_discharge_tonnes,
      row.relative_humidity_est_pct,
      row.temp_mean_c,
    ].every((value) => toNumber(value) !== null),
  );
  const entityIds = sample.map((row) => row.municipality);
  const timeIds = sample.map((row) => row.date.slice(0, 7));
  const y = residualizeTwoWay(
    sample.map((row) => Math.log((toNumber(row.food_waste_discharge_tonnes) ?? 0) + 1)),
    entityIds,
    timeIds,
  );

  const rawVars = {
    precipitation_10mm: sample.map((row) => (toNumber(row.precipitation_mm) ?? 0) / 10),
    humidity_10pct: sample.map((row) => (toNumber(row.relative_humidity_est_pct) ?? 0) / 10),
    temp_10c: sample.map((row) => (toNumber(row.temp_mean_c) ?? 0) / 10),
    rain_flag: sample.map((row) => (String(row.flag_rain) === "1" ? 1 : 0)),
    monday: sample.map((row) => (dayOfWeek(row.date) === 1 ? 1 : 0)),
    saturday: sample.map((row) => (dayOfWeek(row.date) === 6 ? 1 : 0)),
    sunday: sample.map((row) => (dayOfWeek(row.date) === 0 ? 1 : 0)),
  };
  const residualizedVars = Object.fromEntries(
    Object.entries(rawVars).map(([key, values]) => [key, residualizeTwoWay(values, entityIds, timeIds)]),
  );

  const specs = [
    ["precipitation_10mm", "humidity_10pct", "temp_10c"],
    ["rain_flag", "humidity_10pct", "temp_10c"],
    ["precipitation_10mm", "humidity_10pct", "temp_10c", "monday", "saturday", "sunday"],
  ];
  const results = [];
  const diagnostics = [];
  specs.forEach((spec, index) => {
    const x = sample.map((_, rowIndex) => spec.map((name) => residualizedVars[name][rowIndex]));
    const model = olsNoIntercept(y, x, spec);
    for (const result of model.rows) {
      results.push({
        model: `D${index + 1}`,
        dependent_variable: "log(food_waste_tonnes + 1)",
        fixed_effects: "municipality and year-month",
        sample: "Seoul municipalities, daily 2021-01-01 to 2024-01-31",
        ...result,
      });
    }
    diagnostics.push({
      model: `D${index + 1}`,
      dependent_variable: "log(food_waste_tonnes + 1)",
      fixed_effects: "municipality and year-month",
      sample_rows: model.diagnostics.n,
      variables: spec.join("; "),
      r_squared_within: model.diagnostics.r_squared_within,
      residual_std_error: model.diagnostics.residual_std_error,
    });
  });
  return { sample, results, diagnostics };
}

function buildSummary(sample, results, diagnostics, dailyTotals) {
  const model = "D1";
  const rain = results.find((r) => r.model === model && r.variable === "precipitation_10mm");
  const humidity = results.find((r) => r.model === model && r.variable === "humidity_10pct");
  const temp = results.find((r) => r.model === model && r.variable === "temp_10c");
  const dates = [...new Set(sample.map((row) => row.date))].sort();
  const municipalities = new Set(sample.map((row) => row.municipality));
  const highRain = dailyTotals
    .slice()
    .sort((a, b) => (toNumber(b.precipitation_mm) ?? 0) - (toNumber(a.precipitation_mm) ?? 0))
    .slice(0, 5);
  return `# Korea Seoul Daily RFID Weather Regression Summary

Generated: 2026-05-02

## Data

- Regression rows: ${sample.length}
- Seoul municipalities: ${municipalities.size}
- Date coverage: ${dates[0]} to ${dates.at(-1)}
- Fixed effects: municipality and year-month

## Main Daily Model

Dependent variable: \`log(food_waste_tonnes + 1)\`

| Variable | Scale | Coefficient | Approx. percent change | t-stat |
| --- | --- | ---: | ---: | ---: |
| Precipitation | per 10 mm | ${rain.coefficient_log_points} | ${rain.approx_percent_change}% | ${rain.t_stat} |
| Relative humidity | per 10 pct points | ${humidity.coefficient_log_points} | ${humidity.approx_percent_change}% | ${humidity.t_stat} |
| Mean temperature | per 10 C | ${temp.coefficient_log_points} | ${temp.approx_percent_change}% | ${temp.t_stat} |

Within R-squared for D1: ${diagnostics.find((row) => row.model === "D1").r_squared_within}

## Wettest Seoul Days In Sample

| Date | Rainfall mm | Seoul RFID tonnes | Municipalities |
| --- | ---: | ---: | ---: |
${highRain.map((row) => `| ${row.date} | ${row.precipitation_mm} | ${row.food_waste_discharge_tonnes_sum} | ${row.municipalities_count} |`).join("\n")}

## Interpretation

This daily model is more useful than the older monthly pilot because it uses the newly uploaded 2021-2024 RFID daily file. It remains an association model: weather is joined using Seoul station weather, and RFID food-waste discharge is treated as a high-moisture waste-flow proxy.
`;
}

function main() {
  const rows = parseCsv(readText("02_processed_data/korea/korea_seoul_rfid_daily_weather_food_waste_2021_2024.csv"));
  const dailyTotals = summarizeDailyTotals(rows);
  writeCsv("02_processed_data/korea/korea_seoul_rfid_daily_total_weather_2021_2024.csv", dailyTotals);
  const { sample, results, diagnostics } = runRegression(rows);
  writeCsv("03_analysis_outputs/regressions/korea_seoul_daily_fe_regression_results_2021_2024.csv", results);
  writeCsv("03_analysis_outputs/regressions/korea_seoul_daily_fe_regression_diagnostics_2021_2024.csv", diagnostics);
  fs.writeFileSync(
    projectPath("03_analysis_outputs/regressions/korea_seoul_daily_fe_regression_summary_2021_2024.md"),
    buildSummary(sample, results, diagnostics, dailyTotals),
    "utf8",
  );
  console.log(`daily_total_rows=${dailyTotals.length}`);
  console.log(`regression_rows=${sample.length}`);
  console.log(`result_rows=${results.length}`);
}

main();
