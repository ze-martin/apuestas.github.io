export const MIN_RECOMMENDED_PROBABILITY = 0.72
export const MAX_RECOMMENDED_LEGS = 3

export const RECOMMENDATION_PROFILES = [
  {
    id: 'goals-total-over-1-5',
    label: 'Goles +1.5',
    score: 100,
    marketType: 'goals',
    side: 'total',
    direction: 'over',
    line: 1.5,
  },
  {
    id: 'dnb-home',
    label: 'DNB local',
    score: 95,
    marketType: 'draw_no_bet',
    side: 'home',
    direction: 'home',
    line: null,
  },
  {
    id: 'goals-home-over-0-5',
    label: 'Local goles +0.5',
    score: 92,
    marketType: 'goals',
    side: 'home',
    direction: 'over',
    line: 0.5,
  },
  {
    id: 'corners-total-under-10-5',
    label: 'Corners total -10.5',
    score: 86,
    marketType: 'corners',
    side: 'total',
    direction: 'under',
    line: 10.5,
  },
  {
    id: 'goals-home-under-2-5',
    label: 'Local goles -2.5',
    score: 84,
    marketType: 'goals',
    side: 'home',
    direction: 'under',
    line: 2.5,
  },
  {
    id: 'cards-total-under-4-5',
    label: 'Tarjetas total -4.5',
    score: 82,
    marketType: 'cards',
    side: 'total',
    direction: 'under',
    line: 4.5,
  },
  {
    id: 'goals-total-under-3-5',
    label: 'Goles -3.5',
    score: 80,
    marketType: 'goals',
    side: 'total',
    direction: 'under',
    line: 3.5,
  },
  {
    id: 'first-half-goals-total-over-0-5',
    label: '1T +0.5',
    score: 76,
    marketType: 'first_half_goals',
    side: 'total',
    direction: 'over',
    line: 0.5,
  },
]

function sameLine(value, expected) {
  if (expected === null) return value === null || value === undefined
  return value !== null && value !== undefined && Math.abs(value - expected) < 0.01
}

function matchesProfile(pick, profile) {
  return (
    pick.marketType === profile.marketType &&
    pick.side === profile.side &&
    pick.direction === profile.direction &&
    sameLine(pick.line, profile.line)
  )
}

export function recommendationProfile(pick) {
  return RECOMMENDATION_PROFILES.find((profile) => matchesProfile(pick, profile)) ?? null
}

export function recommendationProfileScore(pick) {
  return recommendationProfile(pick)?.score ?? 0
}

export function recommendationProfileLabel(pick) {
  return recommendationProfile(pick)?.label ?? 'Fuera de perfil'
}

export function isHighAccuracyRecommendation(pick) {
  return (
    pick.hasOdds &&
    pick.isPositiveEV &&
    pick.riskTier !== 'Alto' &&
    pick.probability >= MIN_RECOMMENDED_PROBABILITY &&
    recommendationProfileScore(pick) > 0
  )
}

function isRedundantLine(a, b) {
  return (
    a.marketType === b.marketType &&
    a.side === b.side &&
    a.direction === b.direction &&
    a.line !== null &&
    b.line !== null
  )
}

export function createSuggestedParlay(picks, maxLegs = MAX_RECOMMENDED_LEGS) {
  const selected = []
  const maxRecommendedLegs = Math.min(maxLegs, MAX_RECOMMENDED_LEGS)
  const candidates = picks
    .filter(isHighAccuracyRecommendation)
    .sort((a, b) => {
      const riskA = a.riskTier === 'Bajo' ? 0 : 1
      const riskB = b.riskTier === 'Bajo' ? 0 : 1
      return b.probability - a.probability || riskA - riskB || recommendationProfileScore(b) - recommendationProfileScore(a) || b.pickScore - a.pickScore
    })

  for (const candidate of candidates) {
    if (selected.length >= maxRecommendedLegs) break
    const sameGroup = selected.filter((pick) => pick.correlationGroup === candidate.correlationGroup).length
    if (sameGroup >= 1) continue
    if (selected.some((pick) => isRedundantLine(pick, candidate))) continue
    selected.push(candidate)
  }

  return selected
}
