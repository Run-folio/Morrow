export type BuilderNightStatus = { total: number; allocated: number; complete: boolean; language: "en" | "es" };

export function builderNightAllocationLabel(status: BuilderNightStatus): string {
  const { total, allocated, complete, language } = status;
  if (complete) return language === "es" ? "Todas asignadas" : "All allocated";
  const remaining = total - allocated;
  if (remaining > 0) return language === "es"
    ? `${remaining === 1 ? "Queda" : "Quedan"} ${remaining} ${remaining === 1 ? "noche" : "noches"} por planificar`
    : `${remaining} ${remaining === 1 ? "night" : "nights"} left to plan`;
  if (remaining < 0) {
    const excess = -remaining;
    return language === "es"
      ? `${excess === 1 ? "Sobra" : "Sobran"} ${excess} ${excess === 1 ? "noche" : "noches"}`
      : `${excess} ${excess === 1 ? "night" : "nights"} too many`;
  }
  return language === "es" ? "Hay estancias sin noches" : "Stays need nights";
}
