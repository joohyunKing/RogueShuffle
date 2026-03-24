import {
    SUITS, RANKS, SUIT_ORDER,
} from "./constants.js";


let cardIdCounter = 0;

function getRankNum(rank) {
    if (rank === "A") return 14;
    if (rank === "J") return 11;
    if (rank === "Q") return 12;
    if (rank === "K") return 13;
    return parseInt(rank);
}

function getRankScore(rank) {
    if (rank === "A") return 11;
    if (rank === "J") return 10;
    if (rank === "Q") return 10;
    if (rank === "K") return 10;
    return parseInt(rank);

}

export function buildDeck() {
    return SUITS.flatMap(suit =>
        RANKS.map(rank => createCard(suit, rank))
    );
}

function createCard(suit, rank) {
    return {
        id: `${suit}_${rank}_${cardIdCounter++}`, //고유값
        suit,
        rank,
        val: getRankNum(rank),
        baseScore: getRankScore(rank),
        enhancements: [], //강화
        key: `${suit}${rank}` // (UI / 타입 구분용)
    };
}

export function cloneCard(card) {
    return {
        ...card,
        id: `${card.suit}_${card.rank}_${cardIdCounter++}`, // 새 ID
        enhancements: [...card.enhancements] //강화
    };
}

//deck = removeCardById(deck, "D_10_3");
export function removeCardById(cards, cardId) {
    return cards.filter(card => card.id !== cardId);
}

//deck = removeCardsByIds(deck, ["D_10_3", "H_A_5"]);
export function removeCardsByIds(cards, cardIds) {
    const idSet = new Set(cardIds);
    return cards.filter(card => !idSet.has(card.id));
}

// 다이아 10 전부 삭제
//deck = removeCardsByCondition(deck, c => c.suit === "D" && c.val === 10);
export function removeCardsByCondition(cards, conditionFn) {
    return cards.filter(card => !conditionFn(card));
}
