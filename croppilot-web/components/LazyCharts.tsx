"use client";
// Recharts (~110 kB gz) is loaded only when a chart is on screen, not in each page's first-load bundle.
import dynamic from "next/dynamic";
const Skel = ({ h }: { h: number }) => <div className="skel chartskel" style={{ height: h }} aria-busy="true"><span /><span /><span /></div>;
export const CompareChart = dynamic(() => import("./Charts").then((m) => m.CompareChart), { ssr: false, loading: () => <Skel h={280} /> });
export const GridChart = dynamic(() => import("./Charts").then((m) => m.GridChart), { ssr: false, loading: () => <Skel h={260} /> });
