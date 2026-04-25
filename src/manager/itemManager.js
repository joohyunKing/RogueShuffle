import itemData from '../data/item.json';
import { getUiText } from '../service/langService.js';

export const itemList = itemData.items.filter(i => i.useYn === 'Y');
export const itemMap = Object.fromEntries(itemData.items.map(i => [i.id, i])); // 전체 (보유 아이템 효과 적용용)

export function getAllItems() { return itemList; }
export function getItemById(id) { return itemMap[id] ?? null; }

const ITEM_PRICE = { common: 5, rare: 10, epic: 15, legend: 20 };
export function getItemPrice(itemId) {
  const item = itemMap[itemId];
  return ITEM_PRICE[item?.rarity] ?? ITEM_PRICE.common;
}

/**
 * 아이템 효과를 player에 적용하고 로그 메시지를 반환한다.
 * @param {object} player - Player 인스턴스
 * @param {string} itemId - 아이템 id
 * @param {string} itemName - 아이템 표시명 (로그용)
 * @returns {string|null} 배틀 로그 메시지
 */
/**
 * 배틀 한정(scope:'battle') 아이템 효과를 되돌린다.
 * applyItemEffect 와 반대 방향으로 스탯을 조정한다.
 */
export function revertItemEffect(player, itemId) {
  const def = itemMap[itemId];
  const eff = def?.effect;
  if (!eff) return;

  switch (eff.type) {
    case 'attacksPerTurn':
      player.attacksPerTurn -= eff.value;
      break;
    case 'handSize':
      player.handSize -= eff.value;
      player.handSizeLimit -= eff.value;
      break;
    case 'fieldSize':
      player.fieldSize -= eff.value;
      player.fieldSizeLimit -= eff.value;
      break;
  }
}

export function applyItemEffect(player, itemId, itemName, lang = 'en') {
  const def = itemMap[itemId];
  const eff = def?.effect;
  if (!eff) return null;

  const placeholders = { item: itemName, val: eff.value };

  switch (eff.type) {
    case 'heal':
      player.hp = Math.min(player.maxHp, player.hp + eff.value);
      return getUiText(lang, 'battle.log_item_heal', placeholders);
    case 'maxHp':
      player.maxHp += eff.value;
      return getUiText(lang, 'battle.log_item_maxHp', placeholders);
    case 'def':
      player.def += eff.value;
      return getUiText(lang, 'battle.log_item_def', placeholders);
    case 'attacksPerTurn':
      player.attacksPerTurn += eff.value;
      return getUiText(lang, 'battle.log_item_atk_turn', placeholders);
    case 'handSize':
      player.handSize += eff.value;
      player.handSizeLimit += eff.value;
      return getUiText(lang, 'battle.log_item_hand_size', placeholders);
    case 'fieldSize':
      player.fieldSize += eff.value;
      player.fieldSizeLimit += eff.value;
      return getUiText(lang, 'battle.log_item_field_size', placeholders);
    case 'attr':
      player.attrs[eff.suit] += eff.value;
      const suitName = getUiText(lang, `market.suit.${eff.suit}`);
      return getUiText(lang, 'battle.log_item_suit_adapt', { ...placeholders, suit: suitName });
    case 'hand_multi': {
      const ranks = Array.isArray(eff.handRank) ? eff.handRank : [eff.handRank];
      ranks.forEach(r => {
        const rank = String(r);
        if (player.handConfig[rank] != null) {
          player.handConfig[rank].multi += eff.value;
        }
      });
      return getUiText(lang, 'battle.log_item_hand_multi', placeholders);
    }
    case 'upgrade_bingo': {
      player.bingoLevels[eff.target] += 1;
      const bingoTargetName = eff.target === 'h' ? (lang === 'ko' ? '가로' : 'Horizontal') : 
                          eff.target === 'v' ? (lang === 'ko' ? '세로' : 'Vertical') : 
                          (lang === 'ko' ? '대각선' : 'Diagonal');
      return getUiText(lang, 'battle.log_item_bingo_lv', { ...placeholders, target: bingoTargetName, lv: player.bingoLevels[eff.target] });
    }
    case 'copy_hand_card':
      return null; // BattleScene._useItem에서 직접 처리
    case 'seal_hand_card':
      return null; // BattleScene._useItem에서 직접 처리
    case 'remove_hand_cards':
      return null; // BattleScene._useItem에서 직접 처리
    case 'change_suit':
      return null; // BattleItemManager에서 직접 처리
    default:
      return null;
  }
}
