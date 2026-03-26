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
        const index = lowerText.indexOf(areaLC);
        if (index !== -1) {
            let overlaps = false;
            for (let i = index; i < index + areaLC.length; i++) {
                if (matchedIndices.has(i)) { overlaps = true; break; }
            }
            if (overlaps) continue;

            const originalArea = text.substring(index, index + areaLC.length);
            foundAreas.push({ area: originalArea, index, length: areaLC.length });
            for (let i = index; i < index + areaLC.length; i++) matchedIndices.add(i);
        }
    }

    foundAreas.sort((a, b) => a.index - b.index);
    if (!foundAreas.length) return null;

    const typedTokens = foundAreas.map(({ area }) => area);
    if (typedTokens.length >= 2) return `${typedTokens[0]}_${typedTokens[1]}`;
    return typedTokens[0] || null;
}
