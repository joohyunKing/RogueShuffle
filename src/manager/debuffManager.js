import debuffData from '../data/debuff.json';

export { debuffData };
export const debuffMap = Object.fromEntries(debuffData.debuffs.map(d => [d.id, d]));

export class DebuffManager {
  constructor(scene) {
    this.scene = scene;
    this.activeDebuffs    = [];          // { id, turnsLeft }  -1 = battle 지속
    this.disabledCardUids = new Set();   // 사용불가 처리된 카드 uid
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
    }
  }
}
