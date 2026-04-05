import itemData from '../data/item.json';

export const itemList = itemData.items;
export const itemMap = Object.fromEntries(itemData.items.map(i => [i.id, i]));

export function getAllItems() { return itemList; }
export function getItemById(id) { return itemMap[id] ?? null; }

export const maxItemCount = 6;

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
      player.handSize      -= eff.value;
      player.handSizeLimit -= eff.value;
      break;
    case 'fieldSize':
      player.fieldSize      -= eff.value;
      player.fieldSizeLimit -= eff.value;
      break;
  }
}

export function applyItemEffect(player, itemId, itemName) {
  const def = itemMap[itemId];
  const eff = def?.effect;
  if (!eff) return null;

  switch (eff.type) {
    case 'heal':
      player.hp = Math.min(player.maxHp, player.hp + eff.value);
      return `[${itemName}] HP +${eff.value}`;
    case 'maxHp':
      player.maxHp += eff.value;
      return `[${itemName}] 최대 HP +${eff.value}`;
    case 'def':
      player.def += eff.value;
      return `[${itemName}] DEF +${eff.value}`;
    case 'attacksPerTurn':
      player.attacksPerTurn += eff.value;
      return `[${itemName}] 공격횟수 +${eff.value}`;
    case 'handSize':
      player.handSize += eff.value;
      player.handSizeLimit += eff.value;
      return `[${itemName}] 핸드 크기 +${eff.value}`;
    case 'fieldSize':
      player.fieldSize += eff.value;
      player.fieldSizeLimit += eff.value;
      return `[${itemName}] 필드 크기 +${eff.value}`;
    case 'attr':
      player.attrs[eff.suit] += eff.value;
      return `[${itemName}] ${eff.suit} 적응 +${eff.value}`;
    default:
      return null;
  }
}
