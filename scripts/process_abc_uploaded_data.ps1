Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AbcDir = Join-Path $Root "01_raw_data\ABC"
$CompositionPath = Join-Path $AbcDir "Data_Komposisi_Jenis_Sampah_SIPSN_KLHK_2025.csv"
$RfidExtractedDir = Join-Path $AbcDir "rfid_daily_extracted"

function To-DoubleOrNull {
    param($Value)
    if ($null -eq $Value) { return $null }
    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    $n = 0.0
    if ([double]::TryParse($text.Replace(",", ""), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$n)) {
        return $n
    }
    return $null
}

function Zero-IfNull {
    param($Value)
    if ($null -eq $Value) { return 0.0 }
    return [double]$Value
}

function Round-OrBlank {
    param($Value, [int]$Digits = 3)
    if ($null -eq $Value) { return "" }
    return [math]::Round([double]$Value, $Digits)
}

function Normalize-IndonesiaMunicipality {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return "" }
    $s = $Name.ToLowerInvariant().Trim()
    $s = $s -replace "^kab\.\s*", "kabupaten "
    $s = $s -replace "^kab\s+", "kabupaten "
    $s = $s -replace "^kota\s+adm\.\s*", "kota "
    $s = $s -replace "^kota\s+administrasi\s+", "kota "
    $s = $s -replace "[\.,;:]", " "
    $s = $s -replace "\s+", " "
    return $s.Trim()
}

function Score-Range {
    param($Value, [double]$Min, [double]$Max)
    $n = To-DoubleOrNull $Value
    if ($null -eq $n) { return $null }
    $score = (($n - $Min) / ($Max - $Min)) * 100.0
    return [math]::Max(0, [math]::Min(100, $score))
}

function Build-SipsnComposition {
    $rawRows = Get-Content -LiteralPath $CompositionPath | Select-Object -Skip 1 | ConvertFrom-Csv
    $normalized = foreach ($row in $rawRows) {
        $food = To-DoubleOrNull $row.'Food Waste (%)'
        $wood = To-DoubleOrNull $row.'Wood-Sticks (%)'
        $paper = To-DoubleOrNull $row.'Paper-Cardboard(%)'
        $plastic = To-DoubleOrNull $row.'Plastic(%)'
        $metal = To-DoubleOrNull $row.'Metal(%)'
        $fabric = To-DoubleOrNull $row.'Fabric(%)'
        $leather = To-DoubleOrNull $row.'Leather-Rubber(%)'
        $glass = To-DoubleOrNull $row.'Glass(%)'
        $other = To-DoubleOrNull $row.'Others (%)'
        $values = @($food, $wood, $paper, $plastic, $metal, $fabric, $leather, $glass, $other)
        $sum = ($values | Where-Object { $null -ne $_ } | Measure-Object -Sum).Sum
        $missing = @($values | Where-Object { $null -eq $_ }).Count
        [pscustomobject]@{
            country = "Indonesia"
            year = [int]$row.Year
            province = $row.Province
            municipality_original = $row.'Regency (Kabupaten)/City (Kota)'
            municipality_normalized = Normalize-IndonesiaMunicipality $row.'Regency (Kabupaten)/City (Kota)'
            food_waste_share_pct = Round-OrBlank $food 3
            wood_sticks_share_pct = Round-OrBlank $wood 3
            paper_cardboard_share_pct = Round-OrBlank $paper 3
            plastic_share_pct = Round-OrBlank $plastic 3
            metal_share_pct = Round-OrBlank $metal 3
            fabric_share_pct = Round-OrBlank $fabric 3
            leather_rubber_share_pct = Round-OrBlank $leather 3
            glass_share_pct = Round-OrBlank $glass 3
            others_share_pct = Round-OrBlank $other 3
            paper_plastic_share_pct = Round-OrBlank ((Zero-IfNull $paper) + (Zero-IfNull $plastic)) 3
            combustible_dry_share_pct = Round-OrBlank ((Zero-IfNull $wood) + (Zero-IfNull $paper) + (Zero-IfNull $plastic) + (Zero-IfNull $fabric) + (Zero-IfNull $leather)) 3
            reported_component_sum_pct = Round-OrBlank $sum 3
            missing_component_count = $missing
            source = "SIPSN KLHK 2025 composition CSV uploaded in ABC"
        }
    }
    $normalized | Export-Csv -LiteralPath (Join-Path $Root "02_processed_data\indonesia\indonesia_sipsn_2025_composition_normalized.csv") -NoTypeInformation -Encoding UTF8
    return $normalized
}

function Join-SipsnManagementComposition {
    param($CompositionRows)
    $managementPath = Join-Path $Root "02_processed_data\indonesia\indonesia_sipsn_2025_municipality_waste_management_extracted.csv"
    $managementRows = Import-Csv -LiteralPath $managementPath
    $compositionIndex = @{}
    foreach ($row in $CompositionRows) {
        $key = "$($row.province)|$($row.municipality_normalized)"
        if (!$compositionIndex.ContainsKey($key)) { $compositionIndex[$key] = $row }
    }

    $joined = foreach ($m in $managementRows) {
        $norm = Normalize-IndonesiaMunicipality $m.municipality
        $key = "$($m.province)|$norm"
        $c = $compositionIndex[$key]
        $food = if ($null -ne $c) { To-DoubleOrNull $c.food_waste_share_pct } else { $null }
        $paperPlastic = if ($null -ne $c) { To-DoubleOrNull $c.paper_plastic_share_pct } else { $null }
        $unmanagedRaw = To-DoubleOrNull $m.unmanaged_waste_pct
        $unmanagedPct = if ($null -ne $unmanagedRaw -and $unmanagedRaw -le 1.5) { $unmanagedRaw * 100.0 } else { $unmanagedRaw }
        $leakedRaw = To-DoubleOrNull $m.leaked_to_environment_pct
        $leakedPct = if ($null -ne $leakedRaw -and $leakedRaw -le 1.5) { $leakedRaw * 100.0 } else { $leakedRaw }

        $foodScore = Score-Range $food 10 55
        $dryDeficitScore = if ($null -ne $paperPlastic) { 100.0 - (Score-Range $paperPlastic 15 45) } else { $null }
        $unmanagedScore = Score-Range $unmanagedPct 0 100
        $leakedScore = Score-Range $leakedPct 0 100
        $weightedValue = 0.0
        $weightSum = 0.0
        if ($null -ne $foodScore) { $weightedValue += 0.40 * $foodScore; $weightSum += 0.40 }
        if ($null -ne $dryDeficitScore) { $weightedValue += 0.25 * $dryDeficitScore; $weightSum += 0.25 }
        if ($null -ne $unmanagedScore) { $weightedValue += 0.25 * $unmanagedScore; $weightSum += 0.25 }
        if ($null -ne $leakedScore) { $weightedValue += 0.10 * $leakedScore; $weightSum += 0.10 }
        $riskScore = if ($weightSum -gt 0) { $weightedValue / $weightSum } else { $null }
        $riskLevel = if ($null -eq $riskScore) { "" } elseif ($riskScore -ge 70) { "High" } elseif ($riskScore -ge 45) { "Medium" } else { "Low" }

        [pscustomobject]@{
            country = "Indonesia"
            year = $m.year
            province = $m.province
            municipality = $m.municipality
            municipality_normalized = $norm
            waste_generation_tpd = $m.waste_generation_tpd
            managed_waste_pct = $m.managed_waste_pct
            unmanaged_waste_pct = $m.unmanaged_waste_pct
            leaked_to_environment_pct = $m.leaked_to_environment_pct
            rdf_status = $m.rdf_status
            wte_psel = $m.wte_psel
            composition_match = if ($null -ne $c) { "matched" } else { "unmatched" }
            food_waste_share_pct = if ($null -ne $c) { $c.food_waste_share_pct } else { "" }
            paper_cardboard_share_pct = if ($null -ne $c) { $c.paper_cardboard_share_pct } else { "" }
            plastic_share_pct = if ($null -ne $c) { $c.plastic_share_pct } else { "" }
            paper_plastic_share_pct = if ($null -ne $c) { $c.paper_plastic_share_pct } else { "" }
            combustible_dry_share_pct = if ($null -ne $c) { $c.combustible_dry_share_pct } else { "" }
            reported_component_sum_pct = if ($null -ne $c) { $c.reported_component_sum_pct } else { "" }
            municipality_feedstock_risk_score_0_100 = Round-OrBlank $riskScore 2
            municipality_feedstock_risk_level = $riskLevel
            risk_formula_note = "0.40 food share + 0.25 dry combustible deficit + 0.25 unmanaged waste + 0.10 leaked-to-environment; draft screening index"
        }
    }
    $joined | Export-Csv -LiteralPath (Join-Path $Root "02_processed_data\indonesia\indonesia_sipsn_2025_waste_management_composition_joined.csv") -NoTypeInformation -Encoding UTF8

    $matched = @($joined | Where-Object { $_.composition_match -eq "matched" -and (To-DoubleOrNull $_.waste_generation_tpd) -ne $null })
    $totalWaste = ($matched | ForEach-Object { To-DoubleOrNull $_.waste_generation_tpd } | Measure-Object -Sum).Sum
    $weightedFood = (($matched | ForEach-Object { (To-DoubleOrNull $_.waste_generation_tpd) * (To-DoubleOrNull $_.food_waste_share_pct) } | Measure-Object -Sum).Sum / $totalWaste)
    $weightedPaper = (($matched | ForEach-Object { (To-DoubleOrNull $_.waste_generation_tpd) * (To-DoubleOrNull $_.paper_cardboard_share_pct) } | Measure-Object -Sum).Sum / $totalWaste)
    $weightedPlastic = (($matched | ForEach-Object { (To-DoubleOrNull $_.waste_generation_tpd) * (To-DoubleOrNull $_.plastic_share_pct) } | Measure-Object -Sum).Sum / $totalWaste)
    $weightedRisk = (($matched | ForEach-Object { (To-DoubleOrNull $_.waste_generation_tpd) * (To-DoubleOrNull $_.municipality_feedstock_risk_score_0_100) } | Measure-Object -Sum).Sum / $totalWaste)

    $countrySummary = [pscustomobject]@{
        country = "Indonesia"
        year = 2025
        composition_rows_uploaded = @($CompositionRows).Count
        management_rows = @($managementRows).Count
        matched_rows = @($matched).Count
        matched_waste_generation_tpd = [math]::Round($totalWaste, 3)
        weighted_food_waste_share_pct = Round-OrBlank $weightedFood 3
        weighted_paper_cardboard_share_pct = Round-OrBlank $weightedPaper 3
        weighted_plastic_share_pct = Round-OrBlank $weightedPlastic 3
        weighted_paper_plastic_share_pct = Round-OrBlank ($weightedPaper + $weightedPlastic) 3
        weighted_municipality_feedstock_risk_score_0_100 = Round-OrBlank $weightedRisk 2
    }
    $countrySummary | Export-Csv -LiteralPath (Join-Path $Root "02_processed_data\indonesia\indonesia_sipsn_2025_weighted_composition_summary.csv") -NoTypeInformation -Encoding UTF8

    $provinceSummary = $joined | Where-Object { $_.composition_match -eq "matched" } | Group-Object province | ForEach-Object {
        $g = @($_.Group)
        $waste = ($g | ForEach-Object { To-DoubleOrNull $_.waste_generation_tpd } | Measure-Object -Sum).Sum
        $riskWeighted = if ($waste -gt 0) { (($g | ForEach-Object { (To-DoubleOrNull $_.waste_generation_tpd) * (To-DoubleOrNull $_.municipality_feedstock_risk_score_0_100) } | Measure-Object -Sum).Sum / $waste) } else { $null }
        [pscustomobject]@{
            country = "Indonesia"
            year = 2025
            province = $_.Name
            municipalities_matched = @($g).Count
            waste_generation_tpd = Round-OrBlank $waste 3
            weighted_feedstock_risk_score_0_100 = Round-OrBlank $riskWeighted 2
            high_risk_municipalities = @($g | Where-Object { $_.municipality_feedstock_risk_level -eq "High" }).Count
        }
    } | Sort-Object -Property @{Expression = { To-DoubleOrNull $_.weighted_feedstock_risk_score_0_100 }; Descending = $true}
    $provinceSummary | Export-Csv -LiteralPath (Join-Path $Root "02_processed_data\indonesia\indonesia_sipsn_2025_province_feedstock_risk_summary.csv") -NoTypeInformation -Encoding UTF8

    return [pscustomobject]@{
        composition_rows = @($CompositionRows).Count
        management_rows = @($managementRows).Count
        matched_rows = @($matched).Count
        weighted_food = $countrySummary.weighted_food_waste_share_pct
        weighted_paper_plastic = $countrySummary.weighted_paper_plastic_share_pct
    }
}

function Normalize-KoreaRfidDaily {
    $dailyRows = New-Object System.Collections.Generic.List[object]
    $seoulName = -join ([char[]](0xC11C, 0xC6B8, 0xD2B9, 0xBCC4, 0xC2DC))
    foreach ($file in Get-ChildItem -LiteralPath $RfidExtractedDir -Filter "*.csv" | Sort-Object Name) {
        $rows = Import-Csv -LiteralPath $file.FullName -Encoding Default
        foreach ($row in $rows) {
            $props = @($row.PSObject.Properties)
            $province = [string]$props[0].Value
            $municipality = [string]$props[1].Value
            $year = [int]$props[2].Value
            $month = [int]$props[3].Value
            $day = [int]$props[4].Value
            $g = To-DoubleOrNull $props[5].Value
            $count = To-DoubleOrNull $props[6].Value
            $dailyRows.Add([pscustomobject]@{
                date = ("{0:D4}-{1:D2}-{2:D2}" -f $year, $month, $day)
                year = $year
                month = $month
                day = $day
                province = $province
                municipality = $municipality
                food_waste_discharge_g = [int64]$g
                food_waste_discharge_kg = Round-OrBlank ($g / 1000.0) 3
                food_waste_discharge_tonnes = Round-OrBlank ($g / 1000000.0) 6
                discharge_count = [int64]$count
                source_file = $file.Name
            })
        }
    }

    $dailyRows | Sort-Object date, province, municipality | Export-Csv -LiteralPath (Join-Path $Root "02_processed_data\korea\korea_rfid_daily_food_waste_2021_2024_normalized.csv") -NoTypeInformation -Encoding UTF8

    $monthly = $dailyRows | Group-Object province, municipality, year, month | ForEach-Object {
        $gRows = $_.Group
        $first = $gRows[0]
        $gSum = ($gRows | Measure-Object food_waste_discharge_g -Sum).Sum
        $countSum = ($gRows | Measure-Object discharge_count -Sum).Sum
        [pscustomobject]@{
            date_month = ("{0:D4}-{1:D2}-01" -f [int]$first.year, [int]$first.month)
            year = [int]$first.year
            month = [int]$first.month
            province = $first.province
            municipality = $first.municipality
            days_reported = $gRows.Count
            food_waste_discharge_g_sum = [int64]$gSum
            food_waste_discharge_tonnes_sum = Round-OrBlank ($gSum / 1000000.0) 6
            discharge_count_sum = [int64]$countSum
            source = "KECO daily municipality RFID food waste file uploaded in ABC"
        }
    } | Sort-Object date_month, province, municipality
    $monthly | Export-Csv -LiteralPath (Join-Path $Root "02_processed_data\korea\korea_rfid_monthly_municipality_2021_2024_normalized.csv") -NoTypeInformation -Encoding UTF8

    $weather = Import-Csv -LiteralPath (Join-Path $Root "02_processed_data\weather\korea_weather_seoul_gsod_2017_2024_processed.csv")
    $weatherIndex = @{}
    foreach ($w in $weather) { $weatherIndex[$w.date] = $w }
    $seoulDaily = $dailyRows | Where-Object { $_.province -eq $seoulName } | ForEach-Object {
        $w = $weatherIndex[$_.date]
        $tempMean = if ($null -ne $w) { $w.temp_mean_c } else { "" }
        $humidity = if ($null -ne $w) { $w.relative_humidity_est_pct } else { "" }
        $precipitation = if ($null -ne $w) { $w.precipitation_mm } else { "" }
        $wind = if ($null -ne $w) { $w.wind_mean_mps } else { "" }
        $rainFlag = if ($null -ne $w) { $w.flag_rain } else { "" }
        [pscustomobject]@{
            date = $_.date
            year = $_.year
            month = $_.month
            day = $_.day
            province = $_.province
            municipality = $_.municipality
            food_waste_discharge_g = $_.food_waste_discharge_g
            food_waste_discharge_tonnes = $_.food_waste_discharge_tonnes
            discharge_count = $_.discharge_count
            temp_mean_c = $tempMean
            relative_humidity_est_pct = $humidity
            precipitation_mm = $precipitation
            wind_mean_mps = $wind
            flag_rain = $rainFlag
            source = "KECO RFID daily joined to Seoul NOAA GSOD daily weather"
        }
    }
    $seoulDaily | Sort-Object date, municipality | Export-Csv -LiteralPath (Join-Path $Root "02_processed_data\korea\korea_seoul_rfid_daily_weather_food_waste_2021_2024.csv") -NoTypeInformation -Encoding UTF8

    return [pscustomobject]@{
        daily_rows = $dailyRows.Count
        monthly_rows = $monthly.Count
        seoul_daily_rows = ($seoulDaily | Measure-Object).Count
        first_date = ($dailyRows | Sort-Object date | Select-Object -First 1).date
        last_date = ($dailyRows | Sort-Object date | Select-Object -Last 1).date
    }
}

function Write-Summary {
    param($SipsnSummary, $RfidSummary)
    $text = @"
# ABC Uploaded Data Processing Summary

Generated: 2026-05-02

## SIPSN Indonesia Composition

- Uploaded composition rows parsed: $($SipsnSummary.composition_rows)
- Existing SIPSN management rows: $($SipsnSummary.management_rows)
- Management rows matched to composition rows: $($SipsnSummary.matched_rows)
- Waste-weighted matched food-waste share: $($SipsnSummary.weighted_food)%
- Waste-weighted matched paper+plastic share: $($SipsnSummary.weighted_paper_plastic)%

Created:

- `indonesia_sipsn_2025_composition_normalized.csv`
- `indonesia_sipsn_2025_waste_management_composition_joined.csv`
- `indonesia_sipsn_2025_weighted_composition_summary.csv`
- `indonesia_sipsn_2025_province_feedstock_risk_summary.csv`

## Korea RFID Daily Food Waste

- Daily rows parsed: $($RfidSummary.daily_rows)
- Monthly municipality rows created: $($RfidSummary.monthly_rows)
- Seoul daily weather-joined rows: $($RfidSummary.seoul_daily_rows)
- Date coverage: $($RfidSummary.first_date) to $($RfidSummary.last_date)

Created:

- `korea_rfid_daily_food_waste_2021_2024_normalized.csv`
- `korea_rfid_monthly_municipality_2021_2024_normalized.csv`
- `korea_seoul_rfid_daily_weather_food_waste_2021_2024.csv`

## Notes

- Korea RFID source values are in grams, so the normalized outputs include kg and tonnes conversions.
- The 2024 RFID file currently covers January 2024 only, based on the uploaded ZIP filename and parsed rows.
- The SIPSN composition file has fewer rows than the SIPSN management file, so unmatched municipalities remain in the joined file with blank composition values.
"@
    Set-Content -LiteralPath (Join-Path $Root "03_analysis_outputs\audits\abc_uploaded_data_processing_summary.md") -Value $text -Encoding UTF8
}

$compositionRows = Build-SipsnComposition
$sipsnSummary = Join-SipsnManagementComposition -CompositionRows $compositionRows
$rfidSummary = Normalize-KoreaRfidDaily
Write-Summary -SipsnSummary $sipsnSummary -RfidSummary $rfidSummary

Write-Output "sipsn_composition_rows=$($sipsnSummary.composition_rows)"
Write-Output "sipsn_matched_rows=$($sipsnSummary.matched_rows)"
Write-Output "rfid_daily_rows=$($rfidSummary.daily_rows)"
Write-Output "rfid_monthly_rows=$($rfidSummary.monthly_rows)"
Write-Output "rfid_seoul_daily_rows=$($rfidSummary.seoul_daily_rows)"
