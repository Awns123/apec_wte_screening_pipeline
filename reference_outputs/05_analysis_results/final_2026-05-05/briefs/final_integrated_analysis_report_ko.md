# 최종 통합 분석 보고서

작성일: 2026-05-05

## 1. 최종 연구 프레임

현재 데이터로 가장 타당한 연구 프레임은 **Weather-informed WtE feedstock quality risk assessment and literature-calibrated LHV scenario analysis**입니다. 직접 실측 수분함량/LHV 시계열이 없기 때문에, 이 연구를 “검증 완료된 LHV 예측모형”으로 주장하지 않고 “기상-조성 기반 원료품질 위험 선별과 문헌 보정 LHV 시나리오”로 위치시켰습니다.

## 2. 추가 데이터 확인 결과

- 싱가포르 data.gov.sg 폐기물 통계는 2024년까지가 최신 공개 연도입니다.
- SIPSN 공개 포털은 2025년 조성자료를 제공하며 현재 표에서 269개 행이 확인됩니다.
- data.go.id에는 2026년 4월 9일 게시/수정된 SIPSN 처리자료 페이지가 있으나, 텍스트 접근에서 바로 검증 가능한 원자료 다운로드 URL은 확인되지 않았습니다.
- 싱가포르 WTE 시설별 반입량, LHV, 수분함량, downtime이 결합된 공개 운영자료는 여전히 확보되지 않았습니다.

정리 파일: `04_metadata_sources/additional_data_collection_verification_2026-05-05.csv`

## 3. 핵심 결과

### 3개국 최종 위험도

- 평균 위험점수가 가장 높은 국가는 **Indonesia**이며 평균 **69.47점**입니다.
- 단일 국가-연도 기준 최고 위험은 **Indonesia 2025년**, **75.6점(High)**입니다.
- 인도네시아 평균 위험점수는 **69.47점**, 평균 best available LHV 시나리오는 **9.678 MJ/kg**입니다.
- 싱가포르는 disposed 기준으로 보정한 뒤 평균 위험점수 **34.63점**, 평균 LHV 시나리오 **11.561 MJ/kg**입니다.
- 한국은 평균 위험점수 **44.99점**이나, LHV는 조성식이 아니라 Kwon/Bae 문헌 시설 benchmark로 해석해야 합니다.

### 한국 일별 실증

서울 일별 RFID 분석은 직접 LHV를 측정하지는 않지만, 날씨와 고수분 폐기물 흐름이 연결될 수 있음을 보여주는 실증 보강입니다.

- D3 모형에서 기온 10도 상승은 음식물쓰레기 배출 프록시 약 **4.464%** 변화와 연결됩니다.
- 같은 모형에서 강수량 10 mm 효과는 **-0.182%**로 작고 음의 방향입니다.
- 따라서 날씨 효과는 “비가 오면 당일 배출량이 증가한다”보다, 고온/다습 조건의 보관, 부패, 악취, 수분, LHV 저하 위험으로 해석하는 것이 타당합니다.

### 인도네시아 지자체 우선순위

인도네시아는 전국 평균보다 지자체별 격차가 핵심입니다. 최종 우선순위 지수는 기존 feedstock risk, 폐기물 발생량, LHV deficit, 미관리율을 결합했습니다.

- 최우선 후보는 **Jawa Barat - Kabupaten Cianjur**입니다.
- 이 지역의 최종 우선순위 점수는 **88.23점**이고, 위험가중 폐기물 부하는 **1185.085 t/day**입니다.
- 이 결과는 WtE 단독 추진보다 음식물류 분리, 전처리, RDF 품질관리, 수거체계 개선을 먼저 검토해야 함을 시사합니다.

### 싱가포르 보강 분석

싱가포르는 generated 기준보다 disposed 기준 조성이 WTE 반입 프록시에 더 가깝습니다. 최종 분석에서는 disposed 조성과 Changi/S24 공식 습도를 사용했습니다.

- 2024년 싱가포르 best available LHV 시나리오는 **11.58 MJ/kg**입니다.
- 같은 해 최종 위험점수는 **34.42점**입니다.
- NEA WTE 전력 프록시는 FY2024 기준 발전 **289138 MWh**, 수출 **193909 MWh**입니다.
- 다만 이 값은 전체 시설별 성능자료가 아니라 NEA 보고서 기반 운영 프록시입니다.

## 4. 최종 분석 산출물

- `tables/final_country_year_risk_lhv_panel.csv`
- `tables/final_country_summary.csv`
- `tables/final_indonesia_municipal_priority_top50.csv`
- `tables/final_singapore_weather_lhv_wte_panel.csv`
- `tables/final_korea_empirical_summary.csv`
- `figures/final_country_mean_risk.svg`
- `figures/final_risk_vs_lhv_scatter.svg`
- `figures/final_indonesia_top_priority.svg`

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
