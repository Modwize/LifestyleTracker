// Alcohol cadence classifier. Thresholds per spec.

export type AlcoholClass = 'neutral' | 'warning' | 'escalation_candidate';

export interface AlcoholClassification {
  drinks: number;
  class: AlcoholClass;
  impactFlags: {
    sleep: boolean;
    adherence: boolean;
    weightTrend: boolean;
  };
  escalate: boolean;
}

export function classifyAlcoholWeek(
  drinks: number,
  impact: { sleep: boolean; adherence: boolean; weightTrend: boolean },
  softCap = 4,
  hardCap = 6,
): AlcoholClassification {
  let cls: AlcoholClass = 'neutral';
  if (drinks > softCap && drinks <= hardCap) cls = 'warning';
  if (drinks > hardCap) cls = 'escalation_candidate';
  // Spec: escalate only if actually impacting sleep/adherence/weight trend.
  const escalate = cls === 'escalation_candidate' &&
    (impact.sleep || impact.adherence || impact.weightTrend);
  return { drinks, class: cls, impactFlags: impact, escalate };
}
