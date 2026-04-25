import { itemMap, getAllItems, applyItemEffect } from './itemManager.js';
import { sealMap, getSealTypes } from './sealManager.js';

/**
 * 전용 아이템 핸들러 (BattleScene에서 분리)
 * 전투 중 아이템 사용 시의 복잡한 로직을 담당
 */
export class BattleItemManager {
  constructor(scene) {
    this.scene = scene;
  }

  use(idx, obj) {
    const { player, handData, selected, dummyData, deckData, fieldData } = this.scene;
    const item = player.items[idx];
    if (!item) { obj?.destroy(); return; }

    const def = itemMap[item.id];
    const eff = def?.effect;

    // ── 카드 복사 ──────────────────────────────────────────
    if (eff?.type === 'copy_hand_card') {
      const selectedIdxs = [...selected];
      if (selectedIdxs.length !== 1) { this._cancel(obj); return; }

      const src = handData[selectedIdxs[0]];
      const copy = {
        ...src,
        uid: crypto.randomUUID(),
        enhancements: src.enhancements ? src.enhancements.map(e => ({ ...e })) : [],
      };
      handData.push(copy);
      selected.clear();
      this.scene.addBattleLog(`[${item.name}] ${src.key} 복사!`);
      this._consume(idx, obj);
      return;
    }

    // ── 씰 랜덤 강화 ────────────────────────────────────────
    if (eff?.type === 'seal_hand_card') {
      const selectedIdxs = [...selected];
      if (selectedIdxs.length !== 1) { this._cancel(obj); return; }

      const card = handData[selectedIdxs[0]];
      if ((card.enhancements?.length ?? 0) > 0) { this._cancel(obj); return; }

      const types = getSealTypes();
      const type = types[Math.floor(Math.random() * types.length)];
      card.enhancements = [{ type }];
      selected.clear();
      this.scene.addBattleLog(`[${item.name}] ${card.key} → ${type} 씰 강화!`);
      this._consume(idx, obj);
      return;
    }

    // ── 다중 씰 랜덤 강화 ──────────────────────────────────
    if (eff?.type === 'seal_hand_cards_multi') {
      const cardCount = eff.cards ?? 3;
      const selectedIdxs = [...selected];
      if (selectedIdxs.length !== cardCount) { this._cancel(obj); return; }

      const types = getSealTypes();
      const keys = [];
      selectedIdxs.forEach(i => {
        const card = handData[i];
        const type = types[Math.floor(Math.random() * types.length)];
        card.enhancements = [{ type }];
        keys.push(`${card.key}→${type}`);
      });
      selected.clear();
      this.scene.addBattleLog(`[${item.name}] ${keys.join(', ')} 씰 강화!`);
      this._consume(idx, obj);
      return;
    }

    // ── 특정 씰 부여 ────────────────────────────────────────
    if (eff?.type === 'seal_stamp') {
      const cardCount = eff.cards ?? 2;
      const sealId = eff.sealId;
      const selectedIdxs = [...selected];
      if (selectedIdxs.length !== cardCount) { this._cancel(obj); return; }

      const keys = [];
      selectedIdxs.forEach(i => {
        const card = handData[i];
        card.enhancements = [{ type: sealId }];
        keys.push(card.key);
      });
      selected.clear();
      this.scene.addBattleLog(`[${item.name}] ${keys.join(', ')} → ${sealId} 씰 부여!`);
      this._consume(idx, obj);
      return;
    }

    // ── 카드 제거 ──────────────────────────────────────────
    if (eff?.type === 'remove_hand_cards') {
      const maxCards = eff.maxCards ?? 2;
      const selectedIdxs = [...selected];
      if (selectedIdxs.length === 0 || selectedIdxs.length > maxCards) { this._cancel(obj); return; }

      selectedIdxs.sort((a, b) => b - a).forEach(i => {
        const removed = handData.splice(i, 1)[0];
        if (removed) dummyData.push(removed);
      });
      selected.clear();
      this.scene.addBattleLog(`[${item.name}] 카드 ${selectedIdxs.length}장 제거`);
      this._consume(idx, obj);
      return;
    }

    // ── 더미 회수 ──────────────────────────────────────────
    if (eff?.type === 'recycle_dummy') {
      const count = eff.cards ?? 5;
      if (dummyData.length === 0) { this._cancel(obj); return; }

      const actual = Math.min(count, dummyData.length);
      const recycled = dummyData.splice(-actual);
      deckData.push(...recycled);
      this.scene.addBattleLog(`[${item.name}] 더미 ${actual}장 → 덱 상단!`);
      this._consume(idx, obj);
      return;
    }

    // ── 필드 보충 ──────────────────────────────────────────
    if (eff?.type === 'fill_field') {
      const maxField = player.fieldSize;
      const currentCount = fieldData.length;
      const needed = maxField - currentCount;
      if (needed <= 0 || deckData.length === 0) { this._cancel(obj); return; }

      this.scene.deck.startTurn(needed);
      const slotPositions = this.scene.uiManager.calcFieldPositions(maxField);
      const newItems = this.scene.deck.field.slice(currentCount).map((c, i) => ({
        ...c, slotX: slotPositions[currentCount + i]?.x ?? 0
      }));

      fieldData.push(...newItems);
      this.scene.fieldPickCount = Math.max(0, this.scene.fieldPickCount - newItems.length);
      this.scene.addBattleLog(`[${item.name}] 필드 ${newItems.length}장 보충!`);
      
      this.scene.isDealing = true;
      this.scene.animManager.createDeckStack();
      const finalDelay = this.scene.animManager.dealToField(300, newItems);

      this.scene.time.delayedCall(finalDelay + 550, () => {
        this.scene.animManager.clearAnimObjs();
        this.scene.isDealing = false;
        this.scene.render();
      });

      this._consume(idx, obj);
      return;
    }

    // ── 연금술 (카드 변환) ──────────────────────────────────
    if (eff?.type === 'alchemist_crucible') {
      const cardCount = eff.cards ?? 3;
      const selectedIdxs = [...selected];
      if (selectedIdxs.length !== cardCount) { this._cancel(obj); return; }

      const srcIdx = eff.sourceMode === 'leftmost'
        ? selectedIdxs.reduce((a, b) => a < b ? a : b)
        : selectedIdxs[Math.floor(Math.random() * cardCount)];
      const src = handData[srcIdx];

      for (const i of selectedIdxs) {
        if (i === srcIdx) continue;
        const card = handData[i];
        card.suit = src.suit;
        card.rank = src.rank;
        card.val = src.val;
        card.baseScore = src.baseScore;
        card.key = src.key;
        if (eff.sourceMode === 'leftmost') {
          card.enhancements = src.enhancements ? [...src.enhancements.map(e => ({ ...e }))] : [];
        }
      }
      selected.clear();
      this.scene.addBattleLog(`[${item.name}] ${src.key} 기준으로 ${cardCount - 1}장 변환!`);
      this._consume(idx, obj);
      return;
    }

    // ── 일반 아이템 효과 (itemManager 위임) ─────────────────
    const msg = applyItemEffect(player, item.id, item.name);
    if (msg) this.scene.addBattleLog(msg);

    if (def?.scope === 'battle') {
      this.scene._battleItemEffects.push(item.id);
    }

    this._consume(idx, obj);
  }

  _consume(idx, obj) {
    this.scene.player.itemUseCount = (this.scene.player.itemUseCount ?? 0) + 1;
    this.scene.player.items.splice(idx, 1);
    obj?.destroy();
    this.scene.render();
  }

  _cancel(obj) {
    obj?.destroy();
    this.scene.render();
  }
}
