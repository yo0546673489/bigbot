export const CATEGORY_BUTTONS_IDS = [
  'categoryStationWagon',
  'category4Seats',
  'categoryMini',
  'categorySpaciousMini',
  'category8Seats',
  'category9Seats',
  'category10SeatsOrMore'
] as const;

export const CLOTHING_BUTTONS_IDS = [
  'clothingHarediBlackAndWhite',
  'clothingHaredi',
  'clothingReligious',
  'clothingElegant',
  'clothingHasimHasid',
  'clothingDriver',
  'clothingHasimDriver'
] as const;

export const AUTH_CONFIG = {
  tokenKey: 'auth_token',
  tokenExpiry: 2 // 2 days
} as const; 