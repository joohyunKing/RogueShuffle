import debuffData from '../data/debuff.json';
import { HAND_DATA } from '../constants.js';
import { getLang, getHandName } from '../service/langService.js';

export { debuffData };
export const debuffMap = Object.fromEntries(debuffData.debuffs.map(d => [d.id, d]));

export class DebuffManager {
  constructor(scene) {
    this.scene = scene;
    this.activeDebuffs    = [];          // { id, turnsLeft }  -1 = battle 지속
    this.disabledCardUids = new Set();   // 사용불가 처리된 카드 uid
    this.disabledRanks    = new Set();   // 사용불가 카드 랭크 (트릭스터 보스)
    this.disabledSuits    = new Set();   // 사용불가 슈트 (트릭스터 보스)
    this.disabledHandRanks = new Set();  // 사용불가 족보 handRank (트릭스터B 보스)
  }

  // ── 디버프 적용 ─────────────────────────────────────────────────────────────
  applyDebuff(debuffId, monsterName) {
    const { scene } = this;
    const def = debuffMap[debuffId];
    if (!def) return;

    const existing = this.activeDebuffs.find(d => d.id === debuffId);
    if (existing) {
      if (existing.turnsLeft > 0) existing.turnsLeft = def.durationValue;
      scene.addBattleLog(`${monsterName ?? '몬스터'}의 ${def.name} 갱신!`);
      return;
    }

    const turnsLeft = def.duration === 'turn' ? def.durationValue : -1;
    this.activeDebuffs.push({ id: debuffId, turnsLeft });
    scene.addBattleLog(`${monsterName ?? '몬스터'}의 ${def.name} 디버프 적용!`);

    switch (def.type) {
      case '공격력감소':
        scene.player.atk = Math.max(0, scene.player.atk - def.value);
        scene.refreshPlayerStats();
        break;
      case '핸드사이즈감소':
        scene.player.handSize = Math.max(1, scene.player.handSize - def.value);
        break;
      case '필드사이즈감소':
        scene.player.fieldSize = Math.max(1, scene.player.fieldSize - def.value);
        break;
      case '플레이어의 랜덤 카드사용불가': {
        const candidates = scene.handData.filter(c => !this.disabledCardUids.has(c.uid));
        const pick = [...candidates].sort(() => Math.random() - 0.5).slice(0, def.value);
        pick.forEach(c => this.disabledCardUids.add(c.uid));
        break;
      }
      case '플레이어덱에 해로운 카드추가':
        for (let i = 0; i < def.value; i++) {
          const poison = {
            suit: 'S', rank: '2', val: 2, baseScore: -10,
            key: 'S2', uid: `poison_${Date.now()}_${i}`,
            duration: 'temporary', _poison: true,
          };
          scene.deckData.push(poison);
          scene.deck.deckPile.push(poison);
        }
        break;
    }
  }

  // ── 턴 경과 처리 (startTurn 시 호출) ────────────────────────────────────────
  tick() {
    const expired = [];
    this.activeDebuffs = this.activeDebuffs.filter(active => {
      if (active.turnsLeft < 0) return true;   // battle 지속
      active.turnsLeft--;
      if (active.turnsLeft <= 0) { expired.push(active.id); return false; }
      return true;
    });
    expired.forEach(id => this._removeEffect(id));
  }

  // ── 배틀 종료 시 전체 디버프 해제 ──────────────────────────────────────────
  clearAll() {
    for (const active of this.activeDebuffs) {
      this._removeEffect(active.id, true);
    }
    this.activeDebuffs = [];
    this.disabledCardUids.clear();
    this.disabledRanks.clear();
    this.disabledSuits.clear();
    this.disabledHandRanks.clear();
  }

  // ── 카드 봉인 여부 판별 (BattleScene / MonsterManager 공용) ─────────────────
  isCardDisabled(card) {
    return this.disabledCardUids.has(card.uid)
      || this.disabledRanks.has(card.rank)
      || this.disabledSuits.has(card.suit);
  }

  // ── 디버프 효과 해제 ─────────────────────────────────────────────────────────
  _removeEffect(debuffId, silent = false) {
    const { scene } = this;
    const def = debuffMap[debuffId];
    if (!def) return;
    if (!silent) scene.addBattleLog(`${def.name} 디버프 해제`);
    switch (def.type) {
      case '공격력감소':
        scene.player.atk += def.value;
        scene.refreshPlayerStats();
        break;
      case '핸드사이즈감소':
        scene.player.handSize += def.value;
        break;
      case '필드사이즈감소':
        scene.player.fieldSize += def.value;
        break;
      case '플레이어의 랜덤 카드사용불가':
        this.disabledCardUids.clear();
        break;
      case '플레이어덱에 해로운 카드추가':
        scene.deckData = scene.deckData.filter(c => !c._poison);
        scene.deck.deckPile = scene.deck.deckPile.filter(c => !c._poison);
        break;
      case '랜덤랭크사용불가':
        this.disabledRanks.clear();
        break;
      case '랜덤슈트사용불가':
        this.disabledSuits.clear();
        break;
      case '족보사용불가':
        this.disabledHandRanks.clear();
        break;
    }
  }

  // ── 랭크 봉인 적용 (트릭스터 보스) ─────────────────────────────────────────
  applyRankDisable(sourceName) {
    const { scene } = this;

    // 매 보스 턴마다 새로 뽑기 위해 기존 항목 제거 후 재적용
    this.activeDebuffs = this.activeDebuffs.filter(d => d.id !== 'disable_rank');
    this.disabledRanks.clear();

    const allCards = [
      ...(scene.handData  ?? []),
      ...(scene.fieldData ?? []),
      ...(scene.deckData  ?? []),
    ];
    const ranks = [...new Set(allCards.map(c => c.rank))];
    if (ranks.length === 0) return;

    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    this.disabledRanks.add(rank);

    const def = debuffMap['disable_rank'];
    this.activeDebuffs.push({ id: 'disable_rank', turnsLeft: def.durationValue });
    scene.addBattleLog(`${sourceName}의 ${def.name}! [${rank}] 사용 불가!`);
    scene.render();

    return `[${rank}] ${def.description}`;
  }

  // ── 최다 사용 족보 봉인 (트릭스터B 1페이즈) ──────────────────────────────────
  applyMostUsedHandSeal(sourceName) {
    const { scene } = this;
    const lang = getLang(scene);

    this.activeDebuffs = this.activeDebuffs.filter(d => d.id !== 'seal_hand');
    this.disabledHandRanks.clear();

    const counts = scene.player.handUseCounts;
    const best = Object.entries(counts)
      .filter(([, cnt]) => cnt > 0)
      .sort(([, a], [, b]) => b - a)[0];

    // 사용 기록 없으면 활성화된 족보 중 랜덤 봉인
    let handRankNum;
    if (!best) {
      const pool = scene.enabledHands ? [...scene.enabledHands] : Object.keys(HAND_DATA).map(Number);
      handRankNum = pool[Math.floor(Math.random() * pool.length)];
    } else {
      handRankNum = Number(best[0]);
    }
    this.disabledHandRanks.add(handRankNum);

    const def = debuffMap['seal_hand'];
    this.activeDebuffs.push({ id: 'seal_hand', turnsLeft: def.durationValue });

    const displayName = getHandName(lang, HAND_DATA[handRankNum]?.key ?? '');
    scene.addBattleLog(`${sourceName}의 ${def.name}! [${displayName}] 사용 불가!`);
    scene.render();

    return `[${displayName}] ${def.description}`;
  }

  // ── 최다 + 최근 족보 이중 봉인 (트릭스터B 2페이즈) ──────────────────────────
  applyMostAndLastHandSeal(sourceName) {
    const { scene } = this;
    const lang = getLang(scene);

    this.activeDebuffs = this.activeDebuffs.filter(d => d.id !== 'seal_hand');
    this.disabledHandRanks.clear();

    const counts = scene.player.handUseCounts;
    const best = Object.entries(counts)
      .filter(([, cnt]) => cnt > 0)
      .sort(([, a], [, b]) => b - a)[0];

    const mostUsed = best != null ? Number(best[0]) : null;
    const lastUsed = scene.player.lastHandRank;

    const sealed = [];
    if (mostUsed != null) {
      this.disabledHandRanks.add(mostUsed);
      sealed.push(getHandName(lang, HAND_DATA[mostUsed]?.key ?? ''));
    }
    if (lastUsed != null && lastUsed !== mostUsed) {
      this.disabledHandRanks.add(lastUsed);
      sealed.push(getHandName(lang, HAND_DATA[lastUsed]?.key ?? ''));
    }

    // 사용 기록 없으면 활성화된 족보 중 랜덤 2개 봉인
    if (this.disabledHandRanks.size === 0) {
      const pool = scene.enabledHands ? [...scene.enabledHands] : Object.keys(HAND_DATA).map(Number);
      const shuffled = pool.sort(() => Math.random() - 0.5);
      shuffled.slice(0, 2).forEach(rank => {
        this.disabledHandRanks.add(rank);
        sealed.push(getHandName(lang, HAND_DATA[rank]?.key ?? ''));
      });
    }

    if (this.disabledHandRanks.size === 0) return;

    const def = debuffMap['seal_hand'];
    this.activeDebuffs.push({ id: 'seal_hand', turnsLeft: def.durationValue });

    scene.addBattleLog(`${sourceName}의 이중 봉인! [${sealed.join(', ')}] 사용 불가!`);
    scene.render();

    return `[${sealed.join(', ')}] 사용 불가`;
  }

  // ── 슈트 봉인 적용 (트릭스터 보스) ─────────────────────────────────────────
  applySuitDisable(sourceName) {
    const { scene } = this;

    this.activeDebuffs = this.activeDebuffs.filter(d => d.id !== 'disable_suit');
    this.disabledSuits.clear();

    const allCards = [
      ...(scene.handData  ?? []),
      ...(scene.fieldData ?? []),
      ...(scene.deckData  ?? []),
    ];
    const suits = [...new Set(allCards.map(c => c.suit))];
    if (suits.length === 0) return;

    const suit = suits[Math.floor(Math.random() * suits.length)];
    this.disabledSuits.add(suit);

    const SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const def = debuffMap['disable_suit'];
    this.activeDebuffs.push({ id: 'disable_suit', turnsLeft: def.durationValue });
    scene.addBattleLog(`${sourceName}의 ${def.name}! [${SUIT_CHAR[suit] ?? suit}] 사용 불가!`);
    scene.render();

    return `[${SUIT_CHAR[suit] ?? suit}] ${def.description}`;
  }
}
