# APEC WtE 통합 분석·결과·해석 보고서

작성일: 2026-05-11  
통합 범위: 2026-05-05 최종 분석 + 2026-05-07 방법론 보완 ZIP  
대상 ZIP: `apec_methodology_updates_2026-05-07.zip`

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

- 종속변수: `log(food_waste_tonnes + 1)`
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

국가별로 가장 해석 가능한 LHV 값을 사용하되, 반드시 해석 유형을 붙인다. 예를 들어 `composition-model`, `facility-literature-benchmark` 등이다.

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
| Indonesia | 7 | 69.47 | 3 | 9.678 MJ/kg | Medium |
| South Korea | 8 | 44.99 | 0 | 10.323 MJ/kg | Low-Medium |
| Singapore | 5 | 34.63 | 0 | 11.561 MJ/kg | High |

단일 최고 위험 국가-연도는 **Indonesia 2025년**이며, 위험점수는 **75.6점**이다.

## 5. LHV 결과

### 5.1 Same-model comparison

Wang Eq.14 기준으로 보면 인도네시아와 싱가포르의 차이가 뚜렷하다.

| 국가 | Wang Eq.14 평균 LHV |
| --- | ---: |
| Indonesia | 9.678 MJ/kg |
| Singapore | 11.561 MJ/kg |

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
| temp_mean_c | current weather | 4.66% | 0 | 양의 관계 |
| precipitation_mm | current weather | -0.2% | 0.365 | 당일 강수는 유의하지 않음 |
| rain_lag1_mm | lag model | 0.643% | 0.00059 | 전일 강수는 양의 관계 |
| rain_lag2_mm | lag model | 0.237% | 0.02275 | 2일 전 강수는 양의 관계 |
| rain_3d_prev_sum_mm | cumulative model | 0.344% | 0.00017 | 직전 3일 누적강수는 양의 관계 |
| relative_humidity_est_pct | lag model | -0.898% | 0.000001 | 배출량 기준 음의 관계 |

해석:

- 기온은 일관되게 음식물쓰레기 배출 프록시와 양의 관계를 보인다.
- 당일 강수량은 유의하지 않다.
- 전일, 2일 전, 직전 3일 누적강수는 양의 방향으로 나타난다.
- 강수 효과는 당일 반응보다 지연효과로 나타날 가능성이 있다.
- 습도는 배출량 기준에서는 음의 방향으로 나타난다.
- 이 결과는 폐기물 수분함량 또는 LHV를 직접 측정한 결과가 아니다.

## 7. 인도네시아 결과

인도네시아는 국가-연도 위험지수에서 가장 높은 위험을 보인다.

- 평균 위험점수: **69.47점**
- High 연도 수: **3개**
- 평균 best-available LHV: **9.678 MJ/kg**
- 최저 LHV 연도: **2025년**, **9.389 MJ/kg**

지자체 우선순위 상위 지역은 다음과 같다.

| 순위 | 주 | 지자체 | 우선순위 점수 | 폐기물 발생량 | 저위 LHV 시나리오 |
| ---: | --- | --- | ---: | ---: | ---: |
| 1 | Jawa Barat | Kabupaten Cianjur | 88.23 | 1305.16 t/day | 8.843 MJ/kg |

인도네시아 결과는 국가 평균보다 지자체별 차이가 중요하다는 점을 보여준다. 위험점수, 물량, LHV deficit, 미관리율이 함께 높은 지역이 별도로 드러난다.

## 8. 싱가포르 결과

싱가포르는 generated 기준이 아니라 disposed 기준 조성을 사용했다. 이 방식은 WTE 반입 프록시에 더 가깝다.

2024년 결과:

- 위험점수: **34.42점**
- Wang LHV 시나리오: **11.58 MJ/kg**
- Lin LHV 시나리오: **9.775 MJ/kg**
- NEA WTE 발전 프록시: **289138 MWh**
- NEA WTE 전력 수출 프록시: **193909 MWh**

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
| Cross-country annual risk panel | main methods/appendix | Medium |
| Korea Seoul daily RFID + weather pilot | main empirical pilot | High for food-waste flow; Medium for WtE fuel quality inference |
| Indonesia municipal hotspot screening | main planning screen with caveat | Medium |
| Singapore WtE/fuel-quality case | contrast case and proxy analysis | Medium |
| LHV scenarios | scenario interpretation, not measured result | Medium-Low for direct cross-country measurement |

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

- `05_analysis_results/final_2026-05-11/briefs/integrated_analysis_results_interpretation_report_ko.md`
- `05_analysis_results/final_2026-05-11/tables/integrated_country_year_risk_lhv_confidence_panel.csv`
- `05_analysis_results/final_2026-05-11/tables/korea_date_clustered_lagged_rain_regression_results.csv`
- `05_analysis_results/final_2026-05-11/tables/lhv_scenario_A_same_model_comparable_table.csv`
- `05_analysis_results/final_2026-05-11/tables/lhv_scenario_B_best_available_with_interpretation_type.csv`
- `05_analysis_results/final_2026-05-11/tables/data_confidence_rubric_scores.csv`
- `05_analysis_results/final_2026-05-11/tables/dataset_level_confidence_summary.csv`
