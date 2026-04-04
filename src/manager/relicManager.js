import relicData from '../data/relic.json';

export const relicList = relicData.relics;
export const relicMap  = Object.fromEntries(relicData.relics.map(r => [r.id, r]));

export function getRelicById(id)             { return relicMap[id] ?? null; }
export function getAllRelics()               { return relicList; }
export function getRelicsExcluding(ownedSet) { return relicList.filter(r => !ownedSet.has(r.id)); }

const RELIC_PRICE = { common: 20, rare: 30, epic: 40 };
export function getRelicPrice(relicId) {
    const relic = relicMap[relicId];
    return RELIC_PRICE[relic?.rarity] ?? RELIC_PRICE.common;
}
