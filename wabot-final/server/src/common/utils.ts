import parsePhoneNumber from 'libphonenumber-js'
import * as moment from 'moment-timezone';
import { Driver } from '../drivers/schemas/driver.schema';
import { getVehicleKeywords } from './constants';
import { LocalizationService } from './localization/localization.service';
import { Redis } from 'ioredis';

// ✅ FIX 8: AreasCache interface - allows passing cached data instead of hitting Redis
export interface AreasCache {
  supportAreas: string[];
  shortcuts: Record<string, string>;
  relatedToMain: Record<string, string>;
  mainToRelatedList: Record<string, string[]>;
  expiresAt: number;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getLanguageByPhoneNumber = (phoneNumber: string) => {
    const phone = parsePhoneNumber(phoneNumber.includes('+') ? phoneNumber : `+${phoneNumber}`);
    return phone?.country === 'IL' ? 'he' : 'en';
}

export const detectLanguage = (text: string): string => {
    const hebrewPattern = /[\u0590-\u05FF]/;
    return hebrewPattern.test(text) ? 'he' : 'en';
}

export const toLocalPhoneNumber = (internationalNumber: string) => {
    const phoneNumber = parsePhoneNumber(`+${internationalNumber}`);
    if (phoneNumber) {
        return '0' + phoneNumber.nationalNumber
    }
    return null
}

export const formatMessage = (text: string, maxLength = 1024): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

export const getTimePeriod = (lang = 'en', localizationService?: any) => {
    const timezone = lang === 'he' ? 'Asia/Jerusalem' : 'Asia/Ho_Chi_Minh';
    const now = moment().tz(timezone);
    const isMorning = now.isBetween(moment.tz('06:00', 'HH:mm', timezone), moment.tz('11:59', 'HH:mm', timezone));
    const isAfternoon = now.isBetween(moment.tz('12:00', 'HH:mm', timezone), moment.tz('17:59', 'HH:mm', timezone));
    const isEvening = now.isBetween(moment.tz('18:00', 'HH:mm', timezone), moment.tz('23:59', 'HH:mm', timezone));
    const isNight = now.isBetween(moment.tz('00:00', 'HH:mm', timezone), moment.tz('05:59', 'HH:mm', timezone));

    if (localizationService) {
        if (isMorning) return localizationService.getMessage('timeMorning', lang);
        if (isAfternoon) return localizationService.getMessage('timeAfternoon', lang);
        if (isEvening) return localizationService.getMessage('timeEvening', lang);
        if (isNight) return localizationService.getMessage('timeNight', lang);
        return localizationService.getMessage('timeUnknown', lang);
    }

    const periods = {
        en: { morning: '☀️ Good morning', afternoon: '🌞 Good afternoon', evening: '🌙 Good evening', night: '🌙 Good night', unknown: 'Hello' },
        he: { morning: '☀️ בוקר טוב', afternoon: '🌞 צהריים טובים', evening: '🌙 ערב טוב', night: '🌙 לילה טוב', unknown: 'שלום' },
    };

    const t = periods[lang] || periods.en;
    if (isMorning) return t.morning;
    if (isAfternoon) return t.afternoon;
    if (isEvening) return t.evening;
    if (isNight) return t.night;
    return t.unknown;
}

export function extractRelevantLinkFromMessage(message: string, cityNames: string[] = [], localizationService?: any): string | null {
    const linkRegex = /(https?:\/\/\S+|wa\.me\/\S+)/g;
    const links = message.match(linkRegex) || [];
    const hasTav = (link: string) => link.includes('ת');

    if (links.length === 0) return null;
    if (links.length === 1) return links[0];
    if (links.length === 2) return hasTav(links[0]) ? links[0] : null;

    let sectionStartIdx = 0;
    let found = false;
    for (const city of cityNames) {
        const idx = message.indexOf(city);
        if (idx !== -1) {
            sectionStartIdx = idx;
            found = true;
            break;
        }
    }
    if (!found) {
        const keywords = localizationService ? [
            localizationService.getMessage('available', 'he'),
            localizationService.getMessage('free', 'he'),
            'available'
        ] : ['זמין', 'פנוי', 'available'];

        for (const kw of keywords) {
            const idx = message.indexOf(kw);
            if (idx !== -1) { sectionStartIdx = idx; break; }
        }
    }
    const section = message.slice(sectionStartIdx);
    const sectionLinks = section.match(linkRegex) || [];
    return sectionLinks.find(hasTav) || null;
}

export function extractPhoneAndTextFromWaMeLink(link: string): { phoneNumber: string, messageText: string } | null {
    const waMeRegex = /wa\.me\/(\d+)(?:\?text=([^\s]+))?/;
    const match = link.match(waMeRegex);
    if (!match) return null;
    const phoneNumber = match[1];
    let messageText = '';
    if (match[2]) {
        messageText = decodeURIComponent(match[2].replace(/\+/g, ' '));
    }
    return { phoneNumber, messageText };
}

// ======================================================================
// Ride message parser
// ----------------------------------------------------------------------
// 4 message types per spec:
//   regular_text  — 0 links              → buttons: reply group / private / both
//   single_link   — 1 link               → button:  bot ride request
//   two_links     — 2 links              → buttons: bot ride request + dispatcher chat
//   multi_ride    — 4+ links (≥2 rides)  → split into blocks, one ride card each
//
// Rules:
//   - Link order is FIXED: links[0] = bot (ride request), links[1] = dispatcher (chat)
//   - Multi-ride blocks split by 🚗 / 🔷 / numbered prefix / "פנוי ב..."
//   - Chat link is OPEN-ONLY: never auto-sends a message
// ======================================================================

export type RideMessageType = 'regular_text' | 'single_link' | 'two_links' | 'multi_ride';

export interface ParsedRideBlock {
    type: 'regular_text' | 'single_link' | 'two_links';
    rawText: string;
    rideRequestLink: string;     // First link if present (bot ride request)
    rideRequestPhone: string;    // Phone number from rideRequestLink
    rideRequestText: string;     // Pre-filled text from rideRequestLink (e.g. "ת")
    chatLink: string;            // Second link if present (dispatcher chat)
    chatPhone: string;           // Phone number from chatLink
    chatText: string;            // Pre-filled text from chatLink (e.g. "צ kx8 ...")
}

export interface ParsedRideMessage {
    type: RideMessageType;
    blocks: ParsedRideBlock[];   // 1 entry for types 1-3, multiple for multi_ride
}

const LINK_REGEX = /(https?:\/\/\S+|wa\.me\/\S+)/g;

function extractAllLinks(text: string): string[] {
    return text.match(LINK_REGEX) || [];
}

function buildBlock(blockText: string): ParsedRideBlock {
    const links = extractAllLinks(blockText);
    let rideRequestLink = '', rideRequestPhone = '', rideRequestText = '';
    let chatLink = '', chatPhone = '', chatText = '';

    if (links.length >= 1) {
        rideRequestLink = links[0];
        const parsed = extractPhoneAndTextFromWaMeLink(rideRequestLink);
        if (parsed) {
            rideRequestPhone = parsed.phoneNumber;
            rideRequestText = parsed.messageText || 'ת';
        }
    }
    if (links.length >= 2) {
        chatLink = links[1];
        const parsed = extractPhoneAndTextFromWaMeLink(chatLink);
        if (parsed) {
            chatPhone = parsed.phoneNumber;
            chatText = parsed.messageText || 'צ';
        }
    }

    let type: ParsedRideBlock['type'];
    if (links.length === 0) type = 'regular_text';
    else if (links.length === 1) type = 'single_link';
    else type = 'two_links';

    return { type, rawText: blockText, rideRequestLink, rideRequestPhone, rideRequestText, chatLink, chatPhone, chatText };
}

// Lines that mark the start of a new ride inside a multi-ride message.
function isNewRideIndicator(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.includes('🚗') || trimmed.includes('🔷')) return true;
    if (/^\s*\d+[.)]\s/.test(trimmed)) return true;            // "1. ..." / "2) ..."
    if (/(^|\s)פנוי\s*ב/.test(trimmed)) return true;          // "פנוי בב..."
    if (/(^|\s)נסיעה\s*\d/.test(trimmed)) return true;        // "נסיעה 1"
    return false;
}

function splitMessageToRideBlocks(text: string): string[] {
    const lines = text.split('\n');
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
        if (isNewRideIndicator(line) && current.length > 0) {
            blocks.push(current.join('\n'));
            current = [line];
        } else {
            current.push(line);
        }
    }
    if (current.length > 0) blocks.push(current.join('\n'));
    return blocks.map(b => b.trim()).filter(b => b.length > 0);
}

/**
 * Parse a WhatsApp group message into ride blocks per the BigBot spec.
 * Always returns at least one block.
 */
export function parseRideMessage(text: string): ParsedRideMessage {
    const allLinks = extractAllLinks(text);

    // 4+ links → potential multi-ride. Try to split into blocks; only treat
    // it as multi_ride if the split actually produces ≥2 blocks each containing
    // at least one link. Otherwise fall back to a single block.
    if (allLinks.length >= 4) {
        const rawBlocks = splitMessageToRideBlocks(text);
        const blocks = rawBlocks.map(buildBlock);
        const linkedBlocks = blocks.filter(b => b.rideRequestLink || b.chatLink);
        if (linkedBlocks.length >= 2) {
            return { type: 'multi_ride', blocks: linkedBlocks };
        }
    }

    // 0-2 links (or 4+ that didn't split well) → single block
    const block = buildBlock(text);
    let type: RideMessageType;
    if (block.type === 'regular_text') type = 'regular_text';
    else if (block.type === 'single_link') type = 'single_link';
    else type = 'two_links';
    return { type, blocks: [block] };
}

export const fixBoldMultiLine = (str: string) => {
    return str.replace(/\*/g, '')
        .split('\n')
        .map(line => line.trim() ? `*${line.trim()}*` : '')
        .join('\n');
}

export const isInTrial = (user: Driver) => {
    if (user.ignorePayment || user.billingEndAt) return true;
    const timezone = getTimezone(user.language);
    const trialDays = 7;
    const now = moment.tz(timezone);
    const trialEnd = moment.tz(user.createdAt, timezone).add(trialDays, 'days');
    return now.isBefore(trialEnd);
}

export const isNeedToPay = (user: Driver) => {
    if (user.ignorePayment) return false;
    const timezone = getTimezone(user.language);
    const now = moment.tz(timezone);
    return now.isAfter(user.billingEndAt);
}

export const getTimezone = (language: string) => {
    return language === 'he' ? 'Asia/Jerusalem' : 'Asia/Ho_Chi_Minh';
}

// ======================================================================
// App vehicle filters (Hebrew labels chosen by the user from the Android app)
// ----------------------------------------------------------------------
// Each label maps to the Hebrew keywords it should match in a ride message.
// '4 מקומות' is special: it matches when NO specialized keyword appears at
// all (i.e. the default unspecified ride). 'כולם' bypasses all filtering.
// ======================================================================

export const APP_VEHICLE_FILTER_LABELS = [
    '4 מקומות',
    'מיניק',
    'מיניבוס',
    '6 מקומות',
    '7 מקומות',
    '8 מקומות',
    '9 מקומות',
    'ספיישל',
    'רכב גדול',
    'כולם',
] as const;

// ======================================================================
// Ride-message analysis helpers
// ======================================================================

/**
 * Words/phrases in ride messages that carry extra info but are NOT location
 * identifiers. Strip them before trying to match a city/street.
 */
export const RIDE_EXCLUSION_PHRASES = [
    'פיצי מעל', 'מעל', 'ללא פון', 'נסיעה כשרה', 'אני משלם',
    'פיי', 'ביט בסיום', 'פתק', 'נחת עכשיו', 'בדרכונים', 'בחוץ',
    'נהג זורם', 'תופס פאגש', 'לפיש', 'תחנות בתוספת', 'שקית קטנה',
    'כסא תינוק', 'סלקל', 'רכב נוח', 'מנהלים', 'קבלה חובה', 'קבלה בתוספת',
    'א1', 'א 1', '2 ג', '1 ק',
];

// Keywords in a ride message that indicate a LARGE vehicle (≥6 seats) is required.
// Each entry carries the minimum seat count it implies.
const LARGE_VEHICLE_PATTERNS: { keywords: string[]; minSeats: number }[] = [
    { keywords: ['9 מקומות', 'תשע מקומות', 'מיניק מרווח', 'סיינה מעל'], minSeats: 9 },
    { keywords: ['8 מקומות', 'שמונה מקומות', 'ויטו', 'רודיוס', 'מיניבוס'], minSeats: 8 },
    { keywords: ['7 מקומות', 'שבע מקומות', 'סיינה', 'סייאנה', 'מיניק'], minSeats: 7 },
    { keywords: ['6 מקומות', 'שש מקומות', '6 גדול', 'רכב גדול'], minSeats: 6 },
    { keywords: ['4 מקומות', 'ארבע מקומות'], minSeats: 4 },
];

/**
 * Returns the minimum seat count a ride message requires.
 * 4 = regular (no large-vehicle keyword, or explicit "4 מקומות").
 * 6/7/8/9 = various large vehicles.
 */
export function detectRideSeatRequirement(message: string): number {
    const lower = (message || '').toLowerCase();
    for (const { keywords, minSeats } of LARGE_VEHICLE_PATTERNS) {
        if (keywords.some(k => lower.includes(k.toLowerCase()))) return minSeats;
    }
    return 4; // no keyword → standard regular ride
}

// How many seats a driver's selected filter label implies they have.
const DRIVER_FILTER_CAPACITY: Record<string, number> = {
    '4 מקומות': 4,
    '6 מקומות': 6,
    '7 מקומות': 7,
    '8 מקומות': 8,
    '9 מקומות': 9,
    'מיניק':    8,   // מיניק is typically a 7-8 seat vehicle
    'מיניבוס':  9,   // מיניבוס can carry 9+
    'ספיישל':   99,  // special/VIP — accepts everything
    'רכב גדול': 99,  // generic large — accepts any large + regular
    'כולם':     99,  // all types
};

/**
 * Returns true if the ride message matches at least one of the driver's
 * selected vehicle-type filters, applying the hierarchical capacity rule:
 *
 *   A driver with N seats can take any ride requiring ≤ N seats.
 *
 * - empty list / 'כולם' → accept all
 * - '4 מקומות'          → accept only regular (minSeats ≤ 4)
 * - '6 מקומות'          → accept regular + 6-seat rides
 * - '7 מקומות'          → accept regular + 6 + 7
 * - '8 מקומות'          → accept regular + 6 + 7 + 8
 * - '9 מקומות'          → accept all
 * - 'רכב גדול'          → accept all (large vehicle can also do regular runs)
 */
export function matchAppVehicleFilter(message: string, selectedFilters: string[]): boolean {
    if (!selectedFilters || selectedFilters.length === 0) return true;
    if (selectedFilters.includes('כולם')) return true;

    const rideSeats = detectRideSeatRequirement(message);

    for (const filter of selectedFilters) {
        const capacity = DRIVER_FILTER_CAPACITY[filter];
        if (capacity !== undefined && rideSeats <= capacity) return true;
    }
    return false;
}

// ======================================================================
// Delivery detection
// ======================================================================

const DELIVERY_KEYWORDS = ['משלוח', 'משלוחים', 'נחת'];
const DELIVERY_TIME_PATTERN = /עד\s+(שעה|שעתיים|\d+\s*שעות)/;
// "תופס פאגש" is explicitly NOT a delivery indicator per spec.
const DELIVERY_EXCLUSION = ['תופס פאגש'];

/**
 * Returns true if the ride message describes a delivery (not a regular
 * passenger ride). A ride is a delivery when it contains:
 *  - "משלוח" / "משלוחים"
 *  - a time phrase like "עד שעה / עד שעתיים / עד X שעות"
 *
 * Phrases in DELIVERY_EXCLUSION explicitly opt-out of the delivery label
 * even when other keywords appear.
 */
export function isDeliveryRide(message: string): boolean {
    const lower = (message || '').toLowerCase();
    if (DELIVERY_EXCLUSION.some(ex => lower.includes(ex.toLowerCase()))) return false;
    if (DELIVERY_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return true;
    if (DELIVERY_TIME_PATTERN.test(lower)) return true;
    return false;
}

export const isDriverEligible = (
    driver: Driver,
    message: string | null,
    localizationService: LocalizationService
): boolean => {
    const filters = driver.categoryFilters;
    if (!filters?.length) return true;

    const hasAllTypes = filters.some(f => f.key === 'allTypes');
    if (hasAllTypes) return true;

    if (!message) return filters.some(f => f.key === '4Seats');

    const driverFilterKeys = filters.map(f => f.key);
    const vehicleKeywordConfig = getVehicleKeywords(localizationService).find(v => driverFilterKeys.includes(v.id));
    if (!vehicleKeywordConfig) return false;

    const lowerMessage = message.toLowerCase();

    for (const blockedKeyword of vehicleKeywordConfig.blockedKeywords) {
        if (lowerMessage.includes(blockedKeyword.toLowerCase())) return false;
    }

    for (const keyword of vehicleKeywordConfig.keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) return true;
    }

    if (vehicleKeywordConfig.id === '4Seats') return true;

    return false;
};

export const getMainMenuButtons = (language: string, localizationService: LocalizationService) => {
    return {
        optionsTitle: localizationService.getMessage('menuPerformActions', language),
        sections: [
            {
                title: localizationService.getMessage('categorySearchSettings', language),
                rows: [
                    {
                        id: 'settingsFilterCarType',
                        title: localizationService.getMessage('settingsFilterCarType', language),
                        description: localizationService.getMessage('settingsFilterCarTypeDescription', language)
                    },
                    {
                        id: 'settingsLocationShare',
                        title: localizationService.getMessage('settingsLocationShare', language),
                        description: localizationService.getMessage('settingsLocationShareDescription', language)
                    },
                    {
                        id: 'settingsFilterGroups',
                        title: localizationService.getMessage('settingsFilterGroups', language),
                        description: localizationService.getMessage('settingsFilterGroupsButtonDescription', language)
                    }
                ]
            },
            {
                title: localizationService.getMessage('categoryInfoVideos', language),
                rows: [
                    {
                        id: 'infoVideoHelp',
                        title: localizationService.getMessage('infoVideoHelp', language),
                        description: localizationService.getMessage('infoVideoHelpDescription', language)
                    },
                ]
            },
            {
                title: localizationService.getMessage('categorySupport', language),
                rows: [
                    {
                        id: 'supportHuman',
                        title: localizationService.getMessage('supportHuman', language),
                        description: localizationService.getMessage('supportHumanDescription', language)
                    }
                ]
            }
        ]
    }
}

// ✅ FIX 8: getOriginAndDestination now accepts optional AreasCache parameter
// When cache is provided, zero Redis calls are made!
export const getOriginAndDestination = async (
    text: string,
    redisClient: Redis,
    cachedAreas?: AreasCache
): Promise<string | null> => {
    const lowerText = text.toLowerCase();

    let supportAreas: string[] = [];
    let shortcuts: Record<string, string> = {};
    let relatedToMain: Record<string, string> = {};
    let mainToRelatedList: Record<string, string[]> = {};

    if (cachedAreas) {
        // ✅ Use in-memory cache - ZERO Redis calls!
        supportAreas = cachedAreas.supportAreas;
        shortcuts = cachedAreas.shortcuts;
        relatedToMain = cachedAreas.relatedToMain;
        mainToRelatedList = cachedAreas.mainToRelatedList;
    } else {
        // Fallback: load from Redis (for callers that don't have cache)
        try { supportAreas = await redisClient.smembers('wa:areas:support'); } catch { supportAreas = []; }
        try { const s = await redisClient.hgetall('wa:areas:shortcuts'); shortcuts = s || {}; } catch { shortcuts = {}; }
        try { const r = await redisClient.hgetall('wa:areas:related'); relatedToMain = r || {}; } catch { relatedToMain = {}; }
        try {
            const mains = await redisClient.hgetall('wa:areas:related_main_to_list');
            mainToRelatedList = Object.fromEntries(Object.entries(mains || {}).map(([k, v]) => {
                try { return [k, JSON.parse(v as any) as string[]]; } catch { return [k, []]; }
            }));
        } catch { mainToRelatedList = {}; }
    }

    if (!supportAreas.length) return null;

    const searchable = new Set<string>();
    for (const a of supportAreas) searchable.add(a);
    for (const k of Object.keys(shortcuts)) searchable.add(k);
    for (const rel of Object.keys(relatedToMain)) searchable.add(rel);

    const foundAreas: { area: string; index: number; length: number }[] = [];
    const matchedIndices = new Set<number>();
    const sortedAreas = Array.from(searchable.values()).sort((a, b) => b.length - a.length);

    for (const areaLC of sortedAreas) {
        // Whole-word matching: area must be bounded by whitespace, punctuation,
        // WhatsApp formatting chars (*_~), digit↔letter transition, or start/end.
        // Prevents "ים" inside "אופקים" but allows "ים180" and "*בב*".
        const escaped = areaLC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:^|[\\s,.:;!?\\-*_~☚📞]|(?<=\\d))${escaped}(?=$|[\\s,.:;!?\\-*_~☚📞]|(?=\\d))`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(lowerText)) !== null) {
            // The match may include a leading separator — skip it to get the actual area start
            const matchStr = m[0];
            const areaStart = m.index + (matchStr.length - areaLC.length);
            let overlaps = false;
            for (let i = areaStart; i < areaStart + areaLC.length; i++) {
                if (matchedIndices.has(i)) { overlaps = true; break; }
            }
            if (overlaps) continue;

            const originalArea = text.substring(areaStart, areaStart + areaLC.length);
            foundAreas.push({ area: originalArea, index: areaStart, length: areaLC.length });
            for (let i = areaStart; i < areaStart + areaLC.length; i++) matchedIndices.add(i);
            break; // take first non-overlapping match
        }
    }

    foundAreas.sort((a, b) => a.index - b.index);
    if (!foundAreas.length) return null;

    const typedTokens = foundAreas.map(({ area }) => area);
    if (typedTokens.length >= 2) return `${typedTokens[0]}_${typedTokens[1]}`;
    return typedTokens[0] || null;
}
