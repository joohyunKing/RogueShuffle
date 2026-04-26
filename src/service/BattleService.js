import { roundManager } from "../manager/roundManager.js";
import { writeSave, deleteSave } from "../save.js";

/**
 * BattleService - 전투의 비즈니스 로직 및 데이터 처리를 담당합니다.
 */
export class BattleService {
  constructor(scene) {
    this.scene = scene;
  }

  /**
   * 다음 단계 정보를 가져오고 클리어 문구를 가공합니다.
   */
  getClearInfo(round, battleIndex, score) {
    const next = roundManager.getNextStep(round, battleIndex);
    const roundData = !next.isGameEnd ? roundManager.getRoundData(next.round, next.battleIndex) : null;
    const nextType = roundData?.battleInfo?.type;

    const titleText = next.isGameEnd ? "GAME CLEAR!" : (next.isNextRound ? "ROUND CLEAR!" : "BATTLE CLEAR!");
    const subText = `ROUND ${round}-${battleIndex + 1}  SCORE: ${score}`;
    
    let noteText = "";
    if (!next.isGameEnd) {
      if (nextType === 'market') noteText = "To the Market";
      else if (next.isNextRound) noteText = "To the Next Round";
      else noteText = "To the Next Battle";
    }

    return { next, titleText, subText, noteText };
  }

  /**
   * 배틀 데이터를 저장합니다.
   */
  saveBattleState() {
    const { scene } = this;
    writeSave(scene.round, scene.player.toData(), scene.deck.getState(), {
      isBoss: scene.isBoss,
      battleIndex: scene.battleIndex,
      normalCount: scene.normalCount,
      monsterTier: scene.monsterTier,
      totalCost: scene.totalCost,
      monsters: scene.monsterManager.monsters,
    });
  }

  /**
   * 다음 전투를 준비하기 위해 저장합니다.
   */
  saveNextBattleState(next) {
    const { scene } = this;
    writeSave(next.round, scene.player.toData(), scene.deck.getState(), { 
        battleIndex: next.battleIndex 
    });
  }

  /**
   * 저장을 삭제합니다. (게임 오버 시 등)
   */
  clearSave() {
    deleteSave();
  }

  /**
   * 유효한 아이템 드롭 영역인지 판정합니다.
   */
  isValidItemDropZone(px, py, configs) {
    const { PLAYER_PANEL_W, GW, ITEM_PANEL_W, MONSTER_AREA_TOP, MONSTER_AREA_H, FIELD_Y, FIELD_CH, HAND_TOP } = configs;

    if (px < PLAYER_PANEL_W || px > GW - ITEM_PANEL_W) return false;
    
    // 몬스터 영역
    if (py >= MONSTER_AREA_TOP && py <= MONSTER_AREA_TOP + MONSTER_AREA_H) return true;
    
    // 필드 영역
    if (py >= FIELD_Y - FIELD_CH / 2 - 18 && py <= FIELD_Y + FIELD_CH / 2 + 18) return true;
    
    // 핸드 영역
    if (py >= HAND_TOP) return true;
    
    return false;
  }
}
