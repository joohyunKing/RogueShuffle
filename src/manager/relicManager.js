import relicData from '../data/relic.json';

export const relicList = relicData.relics.filter(r => r.useYn === 'Y');
export const relicMap = Object.fromEntries(relicData.relics.map(r => [r.id, r])); // 전체 (보유 유물 조회용)

export function getRelicById(id) { return relicMap[id] ?? null; }
export function getAllRelics() { return relicList; }
export function getRelicsExcluding(ownedSet) { return relicList.filter(r => !ownedSet.has(r.id)); }

export function getActiveRelics(relicIds, relicSlots) {
    return (relicIds || []).map(id => {
        let baseRelic = relicMap[id];
        if (!baseRelic) return null;
        
        if (id === 'up_rune' && relicSlots) {
            const idx = relicSlots.indexOf(id);
            if (idx >= 3) {
                const aboveId = relicSlots[idx - 3];
                const aboveRelic = relicMap[aboveId];
                if (aboveRelic) {
                    return {
                        ...baseRelic,
                        effects: [...(aboveRelic.effects || [])] // effect 복사
                    };
                }
            }
        }
        return baseRelic;
    }).filter(Boolean);
}

const RELIC_PRICE = { common: 20, rare: 30, epic: 40, legend: 50 };
export function getRelicPrice(relicId) {
    const relic = relicMap[relicId];
    return RELIC_PRICE[relic?.rarity] ?? RELIC_PRICE.common;
}
