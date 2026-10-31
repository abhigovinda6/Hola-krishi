import "./globals.css";
import { Suspense, type ReactNode } from "react";
import { Manrope, Noto_Sans_Kannada } from "next/font/google";
import { DATA } from "@/lib/data";
import { AppProvider } from "@/components/AppState";
import Shell from "@/components/Shell";

const manrope = Manrope({ subsets: ["latin"], variable: "--f-ui" });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["400", "600", "700"], variable: "--f-kn" });

export const metadata = { title: "Hola Krishi · Karnataka season planner", description: "Real-data crop comparison for Karnataka taluks: Kharif & Rabi." };

export default function RootLayout({ children }: { children: ReactNode }) {
  const byDistrict: Record<string, string[]> = {};
  for (const tk of DATA.taluks) (byDistrict[tk.district] ??= []).push(tk.taluk);
  for (const d in byDistrict) byDistrict[d].sort();
  const crops = Object.entries(DATA.crops).map(([id, c]) => ({ id, label: c.label, label_kn: c.label_kn }));
  return (
    <html lang="en" className={`${manrope.variable} ${kannada.variable}`}>
      <body>
        <Suspense fallback={<div className="boot">Loading…</div>}>
          <AppProvider opts={{ byDistrict, crops }}><Shell>{children}</Shell></AppProvider>
        </Suspense>
      </body>
    </html>
  );
}
