/**
 * mikoshi-tracker-food — confirmation gate.
 *
 * Determines whether a proposed payload needs user confirmation before being
 * posted, and builds the Spanish-language message to present to the user.
 */

export type FoodMealSource =
  | "label"
  | "similar_to_event"
  | "web_lookup"
  | "vision_only"
  | "manual";

export interface ProposedPayload {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  meal_slot?: string | null;
  sources?: string[] | null;
  confidence: number;
  source: FoodMealSource;
}

/**
 * Returns true when the proposed payload must be confirmed by the user before
 * being posted.
 *
 * The rule from §G6: auto-post when confidence ≥ 0.85 AND source is one of
 * {label, similar_to_event, manual}. Everything else requires confirmation.
 */
export function needsConfirmation(confidence: number, source: FoodMealSource): boolean {
  if (source === "manual") return false;
  if (source === "label" && confidence >= 0.85) return false;
  if (source === "similar_to_event" && confidence >= 0.85) return false;
  return true;
}

/**
 * Builds a user-facing Spanish confirmation message for the proposed payload.
 * Includes the key nutritional values and instructions on how to confirm or
 * correct.
 */
export function buildConfirmationMessage(proposed: ProposedPayload): string {
  const kcal = Math.round(proposed.kcal);
  const prot = Math.round(proposed.protein_g);
  const carbs = Math.round(proposed.carbs_g);
  const fat = Math.round(proposed.fat_g);

  const sourceLabelMap: Record<FoodMealSource, string> = {
    label: "etiqueta nutricional",
    similar_to_event: "historial reciente",
    web_lookup: "búsqueda web",
    vision_only: "estimación visual",
    manual: "entrada manual",
  };
  const sourceLabel = sourceLabelMap[proposed.source];
  const conf = Math.round(proposed.confidence * 100);

  const lines: string[] = [
    `📊 *${proposed.name}*`,
    `Fuente: ${sourceLabel} (confianza ~${conf}%)`,
    "",
    `• Calorías: *${kcal} kcal*`,
    `• Proteínas: ${prot}g`,
    `• Carbohidratos: ${carbs}g`,
    `• Grasa: ${fat}g`,
  ];

  if (proposed.fiber_g != null) {
    lines.push(`• Fibra: ${Math.round(proposed.fiber_g)}g`);
  }

  if (proposed.meal_slot) {
    const slotMap: Record<string, string> = {
      breakfast: "Desayuno",
      lunch: "Almuerzo",
      snack: "Snack",
      dinner: "Cena",
      other: "Otro",
    };
    const slot = slotMap[proposed.meal_slot] ?? proposed.meal_slot;
    lines.push(`• Franja: ${slot}`);
  }

  if (proposed.sources && proposed.sources.length > 0) {
    lines.push("", `Fuentes consultadas: ${proposed.sources.length} resultado(s) web.`);
  }

  lines.push(
    "",
    "¿Lo registro? Responde *sí* para confirmar, o dime los valores correctos (ej. _en realidad eran 300 kcal y 15g proteína_).",
  );

  return lines.join("\n");
}
