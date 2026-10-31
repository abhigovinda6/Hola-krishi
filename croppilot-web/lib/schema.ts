// Input validation with zod (mirrors croppilot/schema.py).
import { z } from "zod";
import { CROP_IDS, TALUK_NAMES } from "./data";

const EXTRA_PREV = ["cotton", "sugarcane", "other"];

export const FieldProfile = z.object({
  field_id: z.string().min(1).max(30).default("FIELD"),
  farmer: z.string().max(60).default("farmer"),
  taluk: z.string().transform((v, ctx) => {
    const m = TALUK_NAMES.find((t) => t.toLowerCase() === v.trim().toLowerCase());
    if (!m) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown taluk '${v}' (${TALUK_NAMES.length} taluks known)` }); return z.NEVER; }
    return m;
  }),
  season: z.enum(["Kharif", "Rabi"]),
  area_acres: z.number().gt(0).lte(200),
  soil_ph: z.number().gte(3.5).lte(10),
  soil_type: z.enum(["deep_black", "medium_black", "shallow_black", "red"]),
  irrigation: z.enum(["none", "protective", "full"]),
  previous_crop: z.preprocess((v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().toLowerCase();
    return ["", "none", "fallow"].includes(s) ? null : s;
  }, z.string().nullable().refine((v) => v === null || CROP_IDS.includes(v) || EXTRA_PREV.includes(v),
      { message: `unknown crop; allowed: ${CROP_IDS.join(", ")}, cotton, sugarcane, other, fallow` })).default(null),
});
export type Field = z.infer<typeof FieldProfile>;

/** Returns the validated field, or throws an Error with readable messages (like validate_field in Python). */
export function validateField(input: unknown): Field {
  const r = FieldProfile.safeParse(input);
  if (!r.success) throw new Error("Invalid field profile -> " + r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}
