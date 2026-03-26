import { LocalizationService } from "./localization/localization.service";

// Button IDs for Interactive Messages
export const BUTTON_IDS = {
  MENU: {
    REGISTER: 'register',
    STATUS: 'status'
  }
} as const;

// WhatsApp Message Types
export const WHATSAPP_MESSAGE_TYPES = {
  TEXT: 'text',
  INTERACTIVE: 'interactive',
  TEMPLATE: 'template'
} as const;

// Interactive Message Types
export const INTERACTIVE_TYPES = {
  BUTTON: 'button',
  LIST: 'list'
} as const;

// Menu Commands - These will be populated dynamically based on language
export const getMenuCommands = (localizationService: LocalizationService) => ({
  REGISTER: ['register', 'hi', 'hello', 
    localizationService.getMessage('greetingHello', 'he'),
    localizationService.getMessage('greetingHi', 'he'),
    localizationService.getMessage('greetingRegister', 'he')
  ],
  MENU: ['menu', localizationService.getMessage('greetingMenu', 'he')]
});

// Validation Constants
export const VALIDATION = {
  NAME: {
    MIN_LENGTH: 2,
    REGEX: /^[a-zA-Z\s\u0590-\u05FF]+$/
  },
  ID: {
    LENGTH: 9,
    REGEX: /^\d{9}$/
  },
} as const;

// WhatsApp API Constants
export const WHATSAPP_API = {
  VERSION: 'v22.0',
  BASE_URL: 'https://graph.facebook.com',
  MAX_BUTTONS: 3,
  MAX_BUTTON_TITLE_LENGTH: 20,
  MAX_SECTION_ROW_TITLE_LENGTH: 24,
} as const; 

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

// Vehicle keywords - These will be populated dynamically based on language
export const getVehicleKeywords = (localizationService: LocalizationService) => [
  {
    "id": "4Seats",
    "keywords": [],
    "blockedKeywords": [
      localizationService.getMessage('vehicleStation', 'he'),
      localizationService.getMessage('vehicleSeats6', 'he'), 
      localizationService.getMessage('vehicleSeats7', 'he'), 
      localizationService.getMessage('vehicleSeats8', 'he'), 
      localizationService.getMessage('vehicleSeats9', 'he'), 
      localizationService.getMessage('vehicleSeats10', 'he'),
      localizationService.getMessage('vehicleMini', 'he'), 
      localizationService.getMessage('vehicleRadius', 'he'), 
      localizationService.getMessage('vehicleSpacious', 'he'), 
      localizationService.getMessage('vehicleSienna', 'he'), 
      localizationService.getMessage('vehicleVito', 'he')
    ]
  },
  {
    "id": "station",
    "keywords": [localizationService.getMessage('vehicleSeats4', 'he')],
    "blockedKeywords": [
      localizationService.getMessage('vehicleSeats6', 'he'), 
      localizationService.getMessage('vehicleSeats7', 'he'), 
      localizationService.getMessage('vehicleSeats8', 'he'), 
      localizationService.getMessage('vehicleSeats9', 'he'), 
      localizationService.getMessage('vehicleSeats10', 'he'),
      localizationService.getMessage('vehicleMini', 'he'), 
      localizationService.getMessage('vehicleRadius', 'he'), 
      localizationService.getMessage('vehicleSpacious', 'he'), 
      localizationService.getMessage('vehicleSienna', 'he'), 
      localizationService.getMessage('vehicleVito', 'he')
    ]
  },
  {
    "id": "minivan6",
    "keywords": [
      localizationService.getMessage('vehicleSeats4', 'he'), 
      localizationService.getMessage('vehicleStation', 'he'), 
      localizationService.getMessage('vehicleSeats6', 'he'), 
      localizationService.getMessage('vehicleMini', 'he'), 
      localizationService.getMessage('vehicleRadius', 'he'), 
      localizationService.getMessage('vehicleSpacious', 'he')
    ],
    "blockedKeywords": [
      localizationService.getMessage('vehicleSeats7', 'he'), 
      localizationService.getMessage('vehicleSeats8', 'he'), 
      localizationService.getMessage('vehicleSeats9', 'he'), 
      localizationService.getMessage('vehicleSeats10', 'he'), 
      localizationService.getMessage('vehicleSienna', 'he'), 
      localizationService.getMessage('vehicleVito', 'he')
    ]
  },
  {
    "id": "6SpaciousSeats",
    "keywords": [
      localizationService.getMessage('vehicleSeats4', 'he'), 
      localizationService.getMessage('vehicleStation', 'he'), 
      localizationService.getMessage('vehicleSeats6', 'he'), 
      localizationService.getMessage('vehicleMini', 'he'), 
      localizationService.getMessage('vehicleRadius', 'he'), 
      localizationService.getMessage('vehicleSpacious', 'he')
    ],
    "blockedKeywords": [
      localizationService.getMessage('vehicleSeats7', 'he'), 
      localizationService.getMessage('vehicleSeats8', 'he'), 
      localizationService.getMessage('vehicleSeats9', 'he'), 
      localizationService.getMessage('vehicleSeats10', 'he'), 
      localizationService.getMessage('vehicleSienna', 'he'), 
      localizationService.getMessage('vehicleVito', 'he')
    ]
  },
  {
    "id": "7Seats",
    "keywords": [
      localizationService.getMessage('vehicleSeats4', 'he'), 
      localizationService.getMessage('vehicleStation', 'he'), 
      localizationService.getMessage('vehicleSeats6', 'he'), 
      localizationService.getMessage('vehicleMini', 'he'), 
      localizationService.getMessage('vehicleRadius', 'he'), 
      localizationService.getMessage('vehicleSpacious', 'he'), 
      localizationService.getMessage('vehicleSeats7', 'he'), 
      localizationService.getMessage('vehicleSienna', 'he')
    ],
    "blockedKeywords": [
      localizationService.getMessage('vehicleSeats8', 'he'), 
      localizationService.getMessage('vehicleSeats9', 'he'), 
      localizationService.getMessage('vehicleSeats10', 'he'), 
      localizationService.getMessage('vehicleVito', 'he')
    ]
  },
  {
    "id": "8Seats",
    "keywords": [
      localizationService.getMessage('vehicleSeats4', 'he'), 
      localizationService.getMessage('vehicleStation', 'he'), 
      localizationService.getMessage('vehicleSeats6', 'he'), 
      localizationService.getMessage('vehicleMini', 'he'), 
      localizationService.getMessage('vehicleRadius', 'he'), 
      localizationService.getMessage('vehicleSpacious', 'he'), 
      localizationService.getMessage('vehicleSeats7', 'he'), 
      localizationService.getMessage('vehicleSienna', 'he'), 
      localizationService.getMessage('vehicleSeats8', 'he')
    ],
    "blockedKeywords": [
      localizationService.getMessage('vehicleSeats9', 'he'), 
      localizationService.getMessage('vehicleSeats10', 'he'), 
      localizationService.getMessage('vehicleVito', 'he')
    ]
  }
];