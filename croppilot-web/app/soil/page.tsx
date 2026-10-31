"use client";
import { useApp } from "@/components/AppState";
import { PageHead, StepNav } from "@/components/Shell";
import { t } from "@/lib/i18n";

const SOILS: [string, string, string][] = [["deep_black", "Deep black", "Cotton soil; holds water well"], ["medium_black", "Medium black", "Moderate depth"], ["shallow_black", "Shallow black", "Thin, dries fast"], ["red", "Red / laterite", "Light, well drained"]];
const IRR: [string, string, string][] = [["none", "Rainfed only", "No irrigation"], ["protective", "1–2 irrigations", "Borewell or farm pond for critical stages"], ["full", "Fully irrigated", "Canal or reliable borewell"]];

export default function Soil() {
  const { farm, update, opts, lang } = useApp();
  const phBad = farm.ph !== "" && !(Number(farm.ph) >= 3.5 && Number(farm.ph) <= 10);
  return (
    <>
      <PageHead kicker={lang === "kn" ? "ಹಂತ 2 / 3" : "Step 2 of 3"} title={lang === "kn" ? "ಮಣ್ಣು ಮತ್ತು ನೀರು" : "Soil and water"} sub="These decide which crops can grow here at all." />
      <div className="card form">
        <fieldset className="tiles four"><legend>{t("soil", lang)}</legend>{SOILS.map(([v, l, d]) => (
          <button key={v} type="button" className={farm.soil === v ? "tile on" : "tile"} onClick={() => update({ soil: v, sel: "" })}><b>{l}</b><small>{d}</small></button>))}</fieldset>
        <fieldset className="tiles"><legend>{t("water", lang)}</legend>{IRR.map(([v, l, d]) => (
          <button key={v} type="button" className={farm.irr === v ? "tile on" : "tile"} onClick={() => update({ irr: v, sel: "" })}><b>{l}</b><small>{d}</small></button>))}</fieldset>
        <div className="fgrid">
          <label>{t("ph", lang)}<input name="soil_ph" type="number" step="0.1" placeholder="e.g. 7.4" value={farm.ph} onChange={(e) => update({ ph: e.target.value, sel: "" })} aria-invalid={phBad} />
            {phBad ? <em className="ferr">pH must be between 3.5 and 10.</em> : farm.ph !== "" && Number(farm.ph) > 8.5 ? <em className="softwarn" data-testid="ph-warn">⚠ {t("ph_high_warn", lang)}</em> : farm.ph !== "" && Number(farm.ph) < 5.5 ? <em className="softwarn" data-testid="ph-warn">⚠ {t("ph_low_warn", lang)}</em> : farm.ph === "" ? <em className="hint">{t("ph_unknown", lang)}. You&apos;ll get a soil-test reminder.</em> : null}</label>
          <label>{t("prev", lang)}<select value={farm.prev} onChange={(e) => update({ prev: e.target.value, sel: "" })}>
            <option value="fallow">Fallow / none</option>{opts.crops.map((c) => <option key={c.id} value={c.id}>{lang === "kn" ? c.label_kn : c.label}</option>)}
            <option value="cotton">Cotton</option><option value="sugarcane">Sugarcane</option><option value="other">Other</option></select></label>
        </div>
      </div>
      <StepNav back="/farm" next="/results" nextLabel="Compare" disabled={!farm.soil || !farm.irr || phBad} />
    </>
  );
}
