declare module '*.mjs' {
  export const MIN_RECOMMENDED_PROBABILITY: number
  export const MAX_RECOMMENDED_LEGS: number

  export interface RecommendationProfile {
    id: string
    label: string
    score: number
    marketType: string
    side: string
    direction: string
    line: number | null
  }

  export interface RecommendationPick {
    hasOdds: boolean
    isPositiveEV: boolean
    riskTier: string
    probability: number
    pickScore: number
    marketType: string
    side: string
    direction: string
    line: number | null
    correlationGroup: string
  }

  export const RECOMMENDATION_PROFILES: RecommendationProfile[]
  export function recommendationProfile<T extends RecommendationPick>(pick: T): RecommendationProfile | null
  export function recommendationProfileScore<T extends RecommendationPick>(pick: T): number
  export function recommendationProfileLabel<T extends RecommendationPick>(pick: T): string
  export function isHighAccuracyRecommendation<T extends RecommendationPick>(pick: T): boolean
  export function createSuggestedParlay<T extends RecommendationPick>(picks: T[], maxLegs?: number): T[]
}
