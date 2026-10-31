"use client";
import { useApp } from "@/components/AppState";
import { PageHead, StepNav } from "@/components/Shell";
import { t } from "@/lib/i18n";

export default function Farm() {
  const { farm, update, opts, lang } = useApp();
  const districts = Object.keys(opts.byDistrict).sort();
  const taluks = farm.d ? opts.byDistrict[farm.d] ?? [] : [];
  const areaBad = farm.a !== "" && !(Number(farm.a) > 0 && Number(farm.a) <= 200);
  return (
    <>
      <PageHead kicker={lang === "kn" ? "ಹಂತ 1 / 3" : "Step 1 of 3"} title={lang === "kn" ? "ನಿಮ್ಮ ಜಮೀನು ಎಲ್ಲಿದೆ?" : "Where is your farm?"} sub="Yields come from your district's records, and prices from the nearest APMC market we have data for." />
      <div className="card form">
        <div className="fgrid">
          <label>{t("district", lang)}<select value={farm.d} onChange={(e) => update({ d: e.target.value, t: "", sel: "" })}>
            <option value="">Select…</option>{districts.map((d) => <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>)}</select></label>
          <label>{t("taluk", lang)}<select value={farm.t} disabled={!farm.d} onChange={(e) => update({ t: e.target.value, sel: "" })}>
            <option value="">Select…</option>{taluks.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>{t("area", lang)}<input type="number" min="0.1" step="0.1" value={farm.a} onChange={(e) => update({ a: e.target.value })} aria-invalid={areaBad} />
            {areaBad && <em className="ferr">Enter between 0.1 and 200 acres.</em>}</label>
        </div>
        <fieldset className="tiles"><legend>{t("season", lang)}</legend>
          {(["Kharif", "Rabi"] as const).map((s) => (
            <button key={s} type="button" className={farm.s === s ? "tile on" : "tile"} onClick={() => update({ s, sel: "" })}>
              <b>{t(s === "Kharif" ? "kharif" : "rabi", lang)}</b><small>{s === "Kharif" ? "Sow Jun–Jul · harvest Oct–Dec" : "Sow Oct–Nov · harvest Feb–Apr"}</small></button>))}
        </fieldset>
      </div>
      <StepNav back="/" next="/soil" disabled={!farm.t || !farm.s || !farm.a || areaBad} />
    </>
  );
}
