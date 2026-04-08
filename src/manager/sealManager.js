import sealData from '../data/seal.json';

export const sealList = sealData.seals;
export const sealMap  = Object.fromEntries(sealData.seals.map(s => [s.id, s]));

/** MarketScene 강화 버튼용: usable=true 인 씰 ID 목록 */
export function getSealTypes() {
  return sealList.filter(s => s.usable).map(s => s.id);
}

/** Phaser용 border 색상 숫자 변환 */
export function sealBorderColor(id) {
  return parseInt((sealMap[id]?.border ?? '#ffffff').replace('#', ''), 16);
}
