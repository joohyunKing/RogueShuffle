
import {
    SUITS, RANKS
} from "../constants.js";
import deckData from '../data/deck.json';

function getDeckConfig(deckId) {
    return deckData.decks.find(d => d.deckId === deckId)
        ?? deckData.decks.find(d => d.usable)
        ?? deckData.decks[0];
}


/*
cards   → 전체 카드
deckPile   → Deck 뽑기용
hand       → 현재 손패
field       → 필드 카드
dummyPile    → dummy 버린 카드
*/

export default class DeckManager {
    constructor(data = {}, player = {}) {
        this.cards = data.cards ?? [];
        this.deckPile = data.deckPile ?? [];
        this.hand = data.hand ?? [];
        this.field = data.field ?? [];
        this.dummyPile = data.dummyPile ?? [];

        //save 없음 만들자
        if (!data.cards) {
            const deckCfg = getDeckConfig(player.deckId);
            const suits = deckCfg.suits ?? SUITS;
            const ranks = deckCfg.ranks ?? RANKS;

            this.cards = suits.flatMap(suit =>
                ranks.map(rank => this.makeCard(suit, rank))
            );

            //deck 에 전체 카드 등록
            this.deckPile.push(...this.cards);
            this.shuffle(this.deckPile);

            //player 의 속성에 따라 hand, field 배치
            this.draw(player.handSize ?? 7);
            this.startTurn(player.fieldSize ?? 5);
        }
    }

    // 🔹 카드 생성 (uid 부여)
    makeCard(suit, rank) {

        return {
            uid: `${suit}_${rank}_${crypto.randomUUID()}`, // 고유 ID (base)
            suit,
            rank,
            val: this.getRankNum(rank),
            baseScore: this.getRankScore(rank),
            enhancements: [],
            key: `${suit}${rank}`,

            // 🔥 DeckManager 연동용
            duration: "permanent",
            createdBy: "base"
        };

    }

    // 🔹 카드 생성 (아이템/스킬용)
    createCard(suit, rank, enhancements = [], duration = 'permanent', createdBy = 'base', to = 'dummy') {
        const newCard = this.makeCard(suit, rank);

        newCard.enhancements = enhancements;
        newCard.duration = duration;
        newCard.createdBy = createdBy;

        //전체 카드에 등록
        this.cards.push(newCard);

        if (to === 'hand') this.hand.push(newCard);
        else if (to === 'deck') this.deckPile.push(newCard);
        else this.dummyPile.push(newCard);
    }

    // 🔹 셔플
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // 🔹 카드 뽑기
    draw(count = 1) {
        for (let i = 0; i < count; i++) {
            /*
            if (this.deckPile.length === 0) {
                this.reshuffle();
            }
            */

            if (this.deckPile.length === 0) return;

            const card = this.deckPile.pop();
            this.hand.push(card);
        }
    }

    // 🔹 버린 카드 섞어서 다시 덱으로
    reshuffle() {
        this.deckPile = this.dummyPile;
        this.dummyPile = [];
        this.shuffle(this.deckPile);
    }

    // 🔹 카드 사용
    useCard(card) {
        this.hand = this.hand.filter(c => c.uid !== card.uid);

        // 지속 카드만 dummy로
        if (card.duration === 'permanent') {
            this.dummyPile.push(card);
        }
    }

    copyCard(card, to = 'dummy') {
        const newCard = {
            ...card,
            uid: `${card.suit}_${card.rank}_${crypto.randomUUID()}`, // 새로운 ID
            enhancements: [...card.enhancements],
            createdBy: "copy"
        };

        // DeckManager 전용 속성 추가
        newCard.uid = crypto.randomUUID();
        newCard.duration = card.duration || 'permanent';

        //전체 카드에 등록
        this.cards.push(newCard);

        if (to === 'hand') this.hand.push(newCard);
        else if (to === 'deck') this.deckPile.push(newCard);
        else this.dummyPile.push(newCard);
    }

    // 🔹 특정 카드 제거
    removeCardById(cardUid) {
        this.cards = this.cards.filter(card => card.uid !== cardUid);
    }

    // 🔹 여러 카드 제거
    removeCardsByIds(cardUids) {
        const idSet = new Set(cardUids);
        this.cards = this.cards.filter(card => !idSet.has(card.uid));
    }

    // 🔹 조건 기반 제거
    removeCardsByCondition(conditionFn) {
        this.cards = this.cards.filter(card => !conditionFn(card));
    }
    // 턴 시작. field 로 정해진 갯수
    startTurn(count = 1) {
        for (let i = 0; i < count; i++) {
            if (this.deckPile.length === 0) return;

            const card = this.deckPile.pop();
            this.field.push(card);
        }
    }

    // 🔹 턴 종료 처리
    endTurn() {
        this.dummyField();
        // turn 카드 제거
        this.hand = this.hand.filter(c => c.duration !== 'turn');
        this.dummyPile = this.dummyPile.filter(c => c.duration !== 'turn');
    }

    // 🔹 전투 종료 처리
    endBattle() {
        const filterPermanent = c => c.duration === 'permanent';

        this.cards = this.cards.filter(filterPermanent);
        this.hand = this.hand.filter(filterPermanent);
        this.deckPile = this.deckPile.filter(filterPermanent);
        this.dummyPile = this.dummyPile.filter(filterPermanent);
    }

    // 🔹 배틀 간 리셋: 모든 permanent 카드를 덱으로 모아 셔플
    resetForNextBattle() {
        const seen = new Set();
        const all = [
            ...this.deckPile,
            ...this.hand,
            ...this.field,
            ...this.dummyPile,
        ].filter(c => {
            if (c.duration !== 'permanent') return false;
            if (seen.has(c.uid)) return false;
            seen.add(c.uid);
            return true;
        });

        this.cards    = all;
        this.deckPile = [...all];
        this.hand      = [];
        this.field     = [];
        this.dummyPile = [];
        this.shuffle(this.deckPile);
    }

    // 🔹 필드 전체 버리기. 턴 종료시마다 발생
    dummyField() {
        this.dummyPile.push(...this.field);
        this.field = [];
    }

    // 🔹 손패 전체 버리기
    dummyHand() {
        this.dummyPile.push(...this.hand);
        this.hand = [];
    }

// 🔹 상태 가져오기 (save용)
    getState() {
        return {
            cards: this.cards,
            deckPile: this.deckPile,
            hand: this.hand,
            field: this.field,
            dummyPile: this.dummyPile
        };
    }

    // 🔹 상태 복원 (load용)
    setState(state) {
        if (state) {
            this.cards = state.cards || [];
            this.deckPile = state.deckPile || [];
            this.hand = state.hand || [];
            this.field = state.field || [];
            this.dummyPile = state.dummyPile || [];
        }
    }


    // 🔹 숫자 값
    getRankNum(rank) {
        if (rank === "A") return 14;
        if (rank === "J") return 11;
        if (rank === "Q") return 12;
        if (rank === "K") return 13;
        return parseInt(rank);
    }

    // 🔹 점수
    getRankScore(rank) {
        if (rank === "A") return 11;
        if (rank === "J") return 10;
        if (rank === "Q") return 10;
        if (rank === "K") return 10;
        return parseInt(rank);
    }
}