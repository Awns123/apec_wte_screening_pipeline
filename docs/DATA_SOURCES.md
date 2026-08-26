# Data Sources And Redistribution Status

The compact CSV snapshot contains no names, contact details, account identifiers, or individual-level records. It consists of country, year, municipality, weather-station, waste-composition, regression-summary, and WtE proxy fields.

Main source families:

- South Korea: official e-Nara/MOE/KECO waste statistics and Seoul-area weather-derived variables.
- Indonesia: SIPSN waste-generation, management, and composition data; literature-based component LHV scenarios.
- Singapore: NEA and data.gov.sg waste/WtE statistics; MSS/NEA Changi weather and S24 humidity.
- Cross-country weather: NASA POWER-derived aggregates in upstream project stages.
- LHV scenarios: published equations and component values, not common facility measurements.

Each included CSV is listed in `metadata/INPUT_DATA_MANIFEST.csv` with size, row count, columns, hash, and source note where present.

Public-source status does not automatically grant unrestricted redistribution. Source-specific terms and team consent remain a publication gate. The compact files should remain private until that review is recorded.
