const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OLD = path.join(ROOT, "05_analysis_results", "final_2026-05-05");
const UPDATE = path.join(ROOT, "01_raw_data", "external_analysis_updates", "apec_methodology_updates_2026-05-07");
const OUT = path.join(ROOT, "05_analysis_results", "final_2026-05-11");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
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
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

function csvEscape(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replaceAll('"', '""')}"` : s;
}

function writeCsv(file, rows, headers = null) {
  ensureDir(path.dirname(file));
  const cols = headers ?? Object.keys(rows[0] ?? {});
  fs.writeFileSync(file, [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))].join("\n"), "utf8");
}

function writeMd(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, "\uFEFF" + text, "utf8");
}

function n(v) {
  if (v === "" || v === null || v === undefined) return null;
  const x = Number(String(v).replaceAll(",", ""));
  return Number.isFinite(x) ? x : null;
}

function r(v, d = 3) {
  const x = n(v);
  return x === null ? "" : Number(x.toFixed(d));
}

function avg(rows, key) {
  const vals = rows.map((row) => n(row[key])).filter((v) => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function main() {
  ensureDir(OUT);
  ensureDir(path.join(OUT, "tables"));
  ensureDir(path.join(OUT, "briefs"));
  ensureDir(path.join(OUT, "figures"));

  const countryPanel = parseCsv(read(path.join(OLD, "tables", "final_country_year_risk_lhv_panel.csv")));
  const countrySummary = parseCsv(read(path.join(OLD, "tables", "final_country_summary.csv")));
  const indonesiaTop = parseCsv(read(path.join(OLD, "tables", "final_indonesia_municipal_priority_top50.csv")));
  const singaporePanel = parseCsv(read(path.join(OLD, "tables", "final_singapore_weather_lhv_wte_panel.csv")));
  const koreaReg = parseCsv(read(path.join(UPDATE, "korea_seoul_daily_regression_date_clustered_lagged_rain_results.csv")));
  const confidence = parseCsv(read(path.join(UPDATE, "revised_country_year_data_confidence_rubric_scores.csv")));
  const datasetConfidence = parseCsv(read(path.join(UPDATE, "dataset_level_confidence_summary_for_report.csv")));
  const lhvA = parseCsv(read(path.join(UPDATE, "lhv_scenario_A_same_model_comparable_table.csv")));
  const lhvB = parseCsv(read(path.join(UPDATE, "lhv_scenario_B_best_available_with_interpretation_type.csv")));

  const confidenceByKey = new Map(confidence.map((row) => [`${row.country}|${row.year}`, row]));
  const merged = countryPanel.map((row) => {
    const conf = confidenceByKey.get(`${row.country}|${row.year}`) ?? {};
    return {
      ...row,
      confidence_source_reliability_0_4: conf.source_reliability_0_4 ?? "",
      confidence_measurement_directness_0_4: conf.measurement_directness_0_4 ?? "",
      confidence_temporal_alignment_0_4: conf.temporal_alignment_0_4 ?? "",
      confidence_core_variable_completeness_0_4: conf.core_variable_completeness_0_4 ?? "",
      confidence_cross_country_comparability_0_4: conf.cross_country_comparability_0_4 ?? "",
      data_confidence_score_0_100: conf.data_confidence_score_0_100 ?? "",
      data_confidence_class: conf.data_confidence_class ?? "",
      confidence_note: conf.confidence_note ?? "",
    };
  });

  writeCsv(path.join(OUT, "tables", "integrated_country_year_risk_lhv_confidence_panel.csv"), merged);
  writeCsv(path.join(OUT, "tables", "country_summary.csv"), countrySummary);
  writeCsv(path.join(OUT, "tables", "indonesia_municipal_priority_top50.csv"), indonesiaTop);
  writeCsv(path.join(OUT, "tables", "singapore_weather_lhv_wte_panel.csv"), singaporePanel);
  writeCsv(path.join(OUT, "tables", "korea_date_clustered_lagged_rain_regression_results.csv"), koreaReg);
  writeCsv(path.join(OUT, "tables", "data_confidence_rubric_scores.csv"), confidence);
  writeCsv(path.join(OUT, "tables", "dataset_level_confidence_summary.csv"), datasetConfidence);
  writeCsv(path.join(OUT, "tables", "lhv_scenario_A_same_model_comparable_table.csv"), lhvA);
  writeCsv(path.join(OUT, "tables", "lhv_scenario_B_best_available_with_interpretation_type.csv"), lhvB);
  copyFile(path.join(UPDATE, "literature_justification_for_weights_quality_regression_lhv.csv"), path.join(OUT, "tables", "literature_justification_for_weights_quality_regression_lhv.csv"));

  for (const fig of ["final_country_mean_risk.svg", "final_risk_vs_lhv_scatter.svg", "final_indonesia_top_priority.svg"]) {
    copyFile(path.join(OLD, "figures", fig), path.join(OUT, "figures", fig));
  }

  const id = countrySummary.find((x) => x.country === "Indonesia");
  const kr = countrySummary.find((x) => x.country === "South Korea");
  const sg = countrySummary.find((x) => x.country === "Singapore");
  const topRisk = [...merged].sort((a, b) => n(b.final_risk_score_0_100) - n(a.final_risk_score_0_100))[0];
  const topCity = indonesiaTop[0];
  const sg2024 = singaporePanel.find((x) => x.year === "2024");
  const bTemp = koreaReg.find((x) => x.model === "B_date_clustered_current_weather" && x.term === "temp_mean_c");
  const bRain = koreaReg.find((x) => x.model === "B_date_clustered_current_weather" && x.term === "precipitation_mm");
  const lag1 = koreaReg.find((x) => x.term === "rain_lag1_mm");
  const lag2 = koreaReg.find((x) => x.term === "rain_lag2_mm");
  const prev3 = koreaReg.find((x) => x.term === "rain_3d_prev_sum_mm");
  const humid = koreaReg.find((x) => x.model === "B+C_date_clustered_lag1_lag2_lag3" && x.term === "relative_humidity_est_pct");
  const idRows = lhvA.filter((x) => x.country === "Indonesia");
  const sgRows = lhvA.filter((x) => x.country === "Singapore");

  const report = `# APEC WtE 통합 분석·결과·해석 보고서

작성일: 2026-05-11  
통합 범위: 2026-05-05 최종 분석 + 2026-05-07 방법론 보완 ZIP  
대상 ZIP: \`apec_methodology_updates_2026-05-07.zip\`

## 1. 보고서 개요

이 보고서는 기존 최종 분석에 새 ZIP의 방법론 보완 자료를 통합해 작성한 분석·결과·해석 보고서이다. 새 ZIP은 새 국가 원자료라기보다, 기존 분석을 방법론적으로 보강하는 결과물이었다. 특히 한국 서울 일별 회귀분석, LHV 비교 방식, 데이터 confidence 평가, 방법론 문헌 근거가 보완되었다.

본 보고서에서 LHV는 실측값이 아니라 문헌 기반 시나리오로 다룬다. 한국 서울 일별 회귀는 WtE 시설 LHV나 bunker moisture를 직접 설명하는 모델이 아니라 food-waste discharge proxy에 대한 실증분석이다.

## 2. 통합된 자료

### 2.1 기존 최종 분석

기존 최종 분석에서 사용한 주요 산출물은 다음과 같다.

- 3개국 국가-연도 WtE 원료품질 위험지수
- 국가-연도별 LHV 시나리오
- 인도네시아 지자체별 WtE/RDF 우선순위
- 싱가포르 disposed 조성 기반 WTE case panel
- 한국 서울 일별 RFID 음식물쓰레기-기상 회귀분석

### 2.2 새 ZIP에서 통합한 내용

| 보완 내용 | 통합 방식 |
| --- | --- |
| 한국 date-clustered + lagged rainfall 회귀 | 한국 실증 결과 해석에 반영 |
| LHV scenario A same-model table | 국가 간 LHV 비교의 엄격 비교 기준으로 반영 |
| LHV scenario B best-available table | 국가별 해석용 LHV로 반영 |
| 5차원 data confidence rubric | 기존 단순 품질점수보다 우선하는 confidence 해석으로 반영 |
| 문헌 근거 CSV | 방법론 타당성 설명에 반영 |

## 3. 분석 방법

### 3.1 국가-연도 위험지수

국가-연도 위험지수는 폐기물 조성과 기상 수분위험을 결합한다.

조성 축:

- 음식물류 폐기물 비중
- 종이·플라스틱 등 건조 가연성 성분 부족

기상 축:

- 연간 강수량
- 강수일수
- 상대습도

위험점수는 0-100점으로 해석하며, 70점 이상은 High, 45점 이상은 Medium, 45점 미만은 Low로 구분했다.

### 3.2 한국 서울 일별 회귀

새 ZIP에서 보완된 한국 회귀는 다음 구조이다.

- 종속변수: \`log(food_waste_tonnes + 1)\`
- 고정효과: municipality + year-month + weekday
- 표준오차: date-clustered standard errors
- 추가 변수: lag-1, lag-2, lag-3 rainfall, 3일/7일 이전 누적강수량
- 관측치: 28,000
- date cluster 수: 1,120

이 모형은 음식물쓰레기 배출량 프록시에 대한 분석이다. 수분함량 또는 LHV를 직접 관측한 분석은 아니다.

### 3.3 LHV 시나리오

LHV는 A/B 방식으로 분리했다.

**A. Same-model comparison**

같은 식으로 계산한 LHV끼리만 국가 간 비교한다. 예를 들어 Wang Eq.14는 Wang Eq.14 값끼리만 비교한다.

**B. Best-available interpretation**

국가별로 가장 해석 가능한 LHV 값을 사용하되, 반드시 해석 유형을 붙인다. 예를 들어 \`composition-model\`, \`facility-literature-benchmark\` 등이다.

### 3.4 데이터 confidence rubric

새 ZIP의 5개 차원 confidence rubric을 반영했다.

1. Source reliability
2. Measurement directness
3. Temporal alignment
4. Core variable completeness
5. Cross-country comparability

이 rubric은 기존 note-count 기반 품질점수보다 보고서용 해석에 적합하다.

## 4. 국가별 주요 결과

| 국가 | 분석연도 | 평균 위험점수 | High 연도 수 | 평균 best-available LHV | confidence 해석 |
| --- | ---: | ---: | ---: | ---: | --- |
| Indonesia | ${id.years} | ${id.mean_risk_score_0_100} | ${id.high_risk_years} | ${id.mean_best_available_lhv_mj_per_kg} MJ/kg | Medium |
| South Korea | ${kr.years} | ${kr.mean_risk_score_0_100} | ${kr.high_risk_years} | ${kr.mean_best_available_lhv_mj_per_kg} MJ/kg | Low-Medium |
| Singapore | ${sg.years} | ${sg.mean_risk_score_0_100} | ${sg.high_risk_years} | ${sg.mean_best_available_lhv_mj_per_kg} MJ/kg | High |

단일 최고 위험 국가-연도는 **${topRisk.country} ${topRisk.year}년**이며, 위험점수는 **${topRisk.final_risk_score_0_100}점**이다.

## 5. LHV 결과

### 5.1 Same-model comparison

Wang Eq.14 기준으로 보면 인도네시아와 싱가포르의 차이가 뚜렷하다.

| 국가 | Wang Eq.14 평균 LHV |
| --- | ---: |
| Indonesia | ${r(avg(idRows, "wang2021_eq14_lhv_mj_per_kg"), 3)} MJ/kg |
| Singapore | ${r(avg(sgRows, "wang2021_eq14_lhv_mj_per_kg"), 3)} MJ/kg |

South Korea는 paper/plastic 세부 조성값이 부족해 Wang Eq.14의 엄격 비교대상에서 제외된다. 한국은 Kwon 2017과 Bae 2024 문헌 benchmark로 해석된다.

### 5.2 Best-available interpretation

Best-available LHV는 각 국가의 자료구조에 맞는 값을 쓴다.

- Indonesia: Wang 2021 Eq.14 composition model
- Singapore: Wang 2021 Eq.14 composition model, disposed composition proxy
- South Korea: Kwon 2017/Bae 2024 facility-literature benchmark

이 값들은 실제 측정값이 아니다. 국가별 상대적 해석에는 사용할 수 있지만, 실측 LHV라고 표현해서는 안 된다.

## 6. 한국 회귀 결과

새 ZIP의 date-clustered/lagged rainfall 회귀 결과는 다음과 같다.

| 변수 | 모형 | 10단위 변화 근사효과 | clustered p-value | 해석 |
| --- | --- | ---: | ---: | --- |
| temp_mean_c | current weather | ${r(bTemp.pct_change_for_10unit, 3)}% | ${r(bTemp.p_value_clustered, 6)} | 양의 관계 |
| precipitation_mm | current weather | ${r(bRain.pct_change_for_10unit, 3)}% | ${r(bRain.p_value_clustered, 3)} | 당일 강수는 유의하지 않음 |
| rain_lag1_mm | lag model | ${r(lag1.pct_change_for_10unit, 3)}% | ${r(lag1.p_value_clustered, 5)} | 전일 강수는 양의 관계 |
| rain_lag2_mm | lag model | ${r(lag2.pct_change_for_10unit, 3)}% | ${r(lag2.p_value_clustered, 5)} | 2일 전 강수는 양의 관계 |
| rain_3d_prev_sum_mm | cumulative model | ${r(prev3.pct_change_for_10unit, 3)}% | ${r(prev3.p_value_clustered, 5)} | 직전 3일 누적강수는 양의 관계 |
| relative_humidity_est_pct | lag model | ${r(humid.pct_change_for_10unit, 3)}% | ${r(humid.p_value_clustered, 6)} | 배출량 기준 음의 관계 |

해석:

- 기온은 일관되게 음식물쓰레기 배출 프록시와 양의 관계를 보인다.
- 당일 강수량은 유의하지 않다.
- 전일, 2일 전, 직전 3일 누적강수는 양의 방향으로 나타난다.
- 강수 효과는 당일 반응보다 지연효과로 나타날 가능성이 있다.
- 습도는 배출량 기준에서는 음의 방향으로 나타난다.
- 이 결과는 폐기물 수분함량 또는 LHV를 직접 측정한 결과가 아니다.

## 7. 인도네시아 결과

인도네시아는 국가-연도 위험지수에서 가장 높은 위험을 보인다.

- 평균 위험점수: **${id.mean_risk_score_0_100}점**
- High 연도 수: **${id.high_risk_years}개**
- 평균 best-available LHV: **${id.mean_best_available_lhv_mj_per_kg} MJ/kg**
- 최저 LHV 연도: **${id.min_lhv_year}년**, **${id.min_best_available_lhv_mj_per_kg} MJ/kg**

지자체 우선순위 상위 지역은 다음과 같다.

| 순위 | 주 | 지자체 | 우선순위 점수 | 폐기물 발생량 | 저위 LHV 시나리오 |
| ---: | --- | --- | ---: | ---: | ---: |
| 1 | ${topCity.province} | ${topCity.municipality} | ${topCity.final_priority_score_0_100} | ${topCity.waste_generation_tpd} t/day | ${topCity.estimated_lhv_low_mj_per_kg} MJ/kg |

인도네시아 결과는 국가 평균보다 지자체별 차이가 중요하다는 점을 보여준다. 위험점수, 물량, LHV deficit, 미관리율이 함께 높은 지역이 별도로 드러난다.

## 8. 싱가포르 결과

싱가포르는 generated 기준이 아니라 disposed 기준 조성을 사용했다. 이 방식은 WTE 반입 프록시에 더 가깝다.

2024년 결과:

- 위험점수: **${sg2024.final_risk_score_0_100}점**
- Wang LHV 시나리오: **${sg2024.best_available_lhv_mj_per_kg} MJ/kg**
- Lin LHV 시나리오: **${sg2024.lin2015_lhv_mj_per_kg} MJ/kg**
- NEA WTE 발전 프록시: **${sg2024.nea_wte_generated_mwh} MWh**
- NEA WTE 전력 수출 프록시: **${sg2024.nea_wte_exported_mwh} MWh**

해석:

- 싱가포르는 disposed 기준에서 낮은 위험점수와 상대적으로 높은 LHV 시나리오를 보인다.
- 그러나 WTE 시설별 반입량, 실제 LHV, 수분함량, downtime 자료가 없기 때문에 시설별 성능모형으로 해석할 수 없다.
- NEA 전력자료는 운영 프록시이며 전체 시설별 회귀분석 자료가 아니다.

## 9. 데이터 confidence 해석

새 confidence rubric 기준으로 국가-연도 데이터의 신뢰도는 다음과 같이 요약된다.

| 국가 | confidence class | 행 수 |
| --- | --- | ---: |
| Indonesia | Medium | 7 |
| Singapore | High | 5 |
| South Korea | Low | 7 |
| South Korea | Medium | 1 |

데이터셋 단위 confidence:

| 데이터셋/모듈 | 보고서 사용 | confidence |
| --- | --- | --- |
${datasetConfidence.map((x) => `| ${x.dataset_or_module} | ${x.suggested_report_use} | ${x.confidence_class} |`).join("\n")}

해석:

- 싱가포르는 공식 자료와 disposed 조성, Changi/S24 기상자료를 쓰므로 confidence가 높다.
- 인도네시아는 SIPSN/team-compiled 자료와 지자체 조성 매칭을 사용하므로 Medium이다.
- 한국 국가-연도 위험지수는 조성 세부값 결측과 대체값 사용 때문에 Low가 많다.
- 한국 일별 RFID 분석은 food-waste flow proxy에 대해서는 강하지만, WtE moisture/LHV inference에 대해서는 제한적이다.

## 10. 종합 해석

현재 통합 결과는 다음을 보여준다.

1. 국가-연도 위험지수에서 인도네시아가 가장 높은 WtE feedstock quality risk를 보인다.
2. 인도네시아의 Wang Eq.14 LHV 시나리오는 평균 10 MJ/kg 미만으로 나타난다.
3. 싱가포르는 disposed 조성 기준으로 낮은 위험점수와 높은 LHV 시나리오를 보인다.
4. 한국은 국가-연도 조성자료 confidence가 낮지만, 서울 일별 RFID 자료는 food-waste flow proxy 분석에는 강하다.
5. 한국 회귀에서 당일 강수는 유의하지 않지만, lagged rainfall은 일부 양의 관계를 보인다.
6. LHV는 같은 모델끼리 비교할 때와 국가별 best-available 값으로 해석할 때를 분리해야 한다.
7. 현재 분석은 직접 수분함량/LHV 예측모형이 아니라 원료품질 위험평가와 문헌 기반 LHV 시나리오 분석이다.

## 11. 해석의 경계

현재 결과로 말할 수 있는 것:

- 폐기물 조성과 기상자료를 결합하면 WtE 원료품질 위험을 선별할 수 있다.
- 인도네시아는 3개국 중 가장 높은 위험 사례로 나타난다.
- 서울 일별 자료는 고온 및 지연강수와 음식물쓰레기 배출 프록시 사이의 관계를 보여준다.
- 싱가포르는 disposed 기준 조성으로 보면 상대적으로 안정적인 WTE feedstock proxy를 가진다.
- 문헌 LHV 식은 위험지수를 LHV 시나리오로 번역하는 데 사용할 수 있다.

현재 결과로 말하기 어려운 것:

- 날씨가 실제 MSW 수분함량을 얼마 변화시켰는지에 대한 직접 추정
- 실제 WtE 반입 폐기물 LHV의 국가별 또는 시설별 실측 비교
- 싱가포르 WTE 시설별 발전효율 회귀분석
- 한국 서울 음식물쓰레기 배출량 변화가 곧 WtE LHV 변화라는 인과적 결론
- 인도네시아 특정 지자체의 실제 WtE 시설 성능 예측

## 12. 최종 산출물

이번 통합판 산출물은 다음 위치에 있다.

- \`05_analysis_results/final_2026-05-11/briefs/integrated_analysis_results_interpretation_report_ko.md\`
- \`05_analysis_results/final_2026-05-11/tables/integrated_country_year_risk_lhv_confidence_panel.csv\`
- \`05_analysis_results/final_2026-05-11/tables/korea_date_clustered_lagged_rain_regression_results.csv\`
- \`05_analysis_results/final_2026-05-11/tables/lhv_scenario_A_same_model_comparable_table.csv\`
- \`05_analysis_results/final_2026-05-11/tables/lhv_scenario_B_best_available_with_interpretation_type.csv\`
- \`05_analysis_results/final_2026-05-11/tables/data_confidence_rubric_scores.csv\`
- \`05_analysis_results/final_2026-05-11/tables/dataset_level_confidence_summary.csv\`
`;

  writeMd(path.join(OUT, "briefs", "integrated_analysis_results_interpretation_report_ko.md"), report);
  writeMd(
    path.join(OUT, "README.md"),
    `# Final Integrated Report - 2026-05-11

This folder integrates the 2026-05-05 final analysis with the 2026-05-07 methodology update ZIP.

## Main Report

- \`briefs/integrated_analysis_results_interpretation_report_ko.md\`

## Key Tables

- \`tables/integrated_country_year_risk_lhv_confidence_panel.csv\`
- \`tables/country_summary.csv\`
- \`tables/indonesia_municipal_priority_top50.csv\`
- \`tables/singapore_weather_lhv_wte_panel.csv\`
- \`tables/korea_date_clustered_lagged_rain_regression_results.csv\`
- \`tables/lhv_scenario_A_same_model_comparable_table.csv\`
- \`tables/lhv_scenario_B_best_available_with_interpretation_type.csv\`
- \`tables/data_confidence_rubric_scores.csv\`
- \`tables/dataset_level_confidence_summary.csv\`

## Figures

- \`figures/final_country_mean_risk.svg\`
- \`figures/final_risk_vs_lhv_scatter.svg\`
- \`figures/final_indonesia_top_priority.svg\`
`,
  );

  console.log(`Integrated 2026-05-11 report written to ${OUT}`);
}

main();
