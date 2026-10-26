export type CityAgentTickMode = "pull" | "push"

export function cityAgentTickMode(env: Record<string, string | undefined> = process.env): CityAgentTickMode {
  return env.CITY_AGENT_TICK_MODE?.trim().toLowerCase() === "push" ? "push" : "pull"
}
