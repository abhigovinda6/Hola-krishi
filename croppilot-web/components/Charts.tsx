"use client";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
export function CompareChart({ rows }: { rows: { name: string; bad: number; typical: number; good: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e6f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => inr(Number(v))} /><Legend /><ReferenceLine y={0} stroke="#999" />
        <Bar dataKey="bad" name="Bad year" fill="#f2545b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="typical" name="Typical" fill="#3d348b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="good" name="Good year" fill="#2bb3a3" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
export function GridChart({ grid }: { grid: Record<string, number> }) {
  const rows = ["bad", "typical", "good"].map((y) => ({ name: y === "bad" ? "Bad yield" : y === "good" ? "Good yield" : "Typical yield",
    low: grid[`${y}/low`], base: grid[`${y}/base`], high: grid[`${y}/high`] }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e6f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => inr(Number(v))} /><Legend /><ReferenceLine y={0} stroke="#999" />
        <Bar dataKey="low" name="Low price" fill="#f7a072" radius={[4, 4, 0, 0]} />
        <Bar dataKey="base" name="Base price" fill="#3d348b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="high" name="High price" fill="#2bb3a3" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
