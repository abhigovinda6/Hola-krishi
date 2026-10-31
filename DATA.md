# Data licences

The code in this repository is under the MIT licence (see `LICENSE`), copyright Abhishek Govindarajulu. That licence does **not** relicense the datasets.

Cleaned tables live in `croppilot/data/` and are copied for the web app into `croppilot-web/data/csv/`. Full provenance, units, and caveats are in [`croppilot/data/sources/SOURCES.md`](croppilot/data/sources/SOURCES.md) (the same note is copied to `croppilot-web/data/csv/SOURCES.md`).

| Dataset | Years in this project | Terms recorded here |
|---|---|---|
| District area, production, and yield (APY), DES via India Data Portal | 1997–2024 | **Open Data Commons Attribution (ODC-By)**. Attribute "DES, MoA&FW via India Data Portal". |
| Mandi prices, AGMARKNET (Hugging Face dump of the government series, plus an earlier public mirror for 2008–2017) | 2002–2024 | The Hugging Face repository is tagged MIT. The underlying prices are Government of India AGMARKNET open data. |
| Minimum Support Price (RBI, CACP, DES, PIB) | through 2025–26 | Published government tables. Cite the source named in `SOURCES.md`. |
| Cost of cultivation, CACP A2+FL (all-India) | cost year used by the app | Published government tables. Cite the PIB release named in `SOURCES.md`. |
| Weather, NASA POWER (rain and temperature used by the model) | 1997–2024 | NASA POWER (MERRA-2). Acknowledge NASA POWER. |
| Rainfall, IMD 0.25° grid | 1997–2024 | Comparison only. The live yield model uses NASA POWER. |

District headquarters are OpenStreetMap Nominatim geocodes. The taluk list comes from the Wikipedia page "List of taluks of Karnataka", which cites karnataka.gov.in. Follow each publisher's licence if you reuse those lists.
