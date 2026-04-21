import { HAND_DATA } from "../constants.js";
import { getLang, getHandName } from "../service/langService.js";

/**
 * BattleUIManager - 전투 중의 각종 UI 구성 요소들을 관리하고 갱신
 */
export class BattleUIManager {
  constructor(scene) {
    this.scene = scene;
  }

  /**
   * 플레이어 스탯 및 레이블 갱신
   */
  refreshPlayerStats() {
    const { scene } = this;
    const p = scene.player;
    
    scene.playerUI?.refresh();
    scene.playerUI?.setDeckCounts({
      deck: scene.deckData?.length ?? 0,
      dummy: scene.dummyData?.length ?? 0,
    });

    // 필드/핸드 카드 수 레이블
    scene._fieldCountCornerTxt?.setText(`${scene.fieldData?.length ?? 0}/${p.fieldSize}`);
    scene._handCountCornerTxt?.setText(`${scene.handData?.length ?? 0}/${p.handSizeLimit}`);
  }

  /**
   * 공격 횟수 레이블 갱신
   */
  refreshAttackCount() {
    const { scene } = this;
    const used = scene.attackCount;
    const max = scene.player.attacksPerTurn;
    scene._attackTxt?.setText(`ATK ${used}/${max}`);
  }

  /**
   * 족보 프리뷰 갱신
   */
  updatePreview(scoreResult, handData, selected) {
    const { scene } = this;
    const { score: cardScore, rank } = scoreResult;
    const score = cardScore > 0 ? Math.floor(cardScore) : 0;

    const handRankSealed = rank != null && scene.debuffManager.disabledHandRanks.has(rank);

    if (rank != null) {
      scene._updateHandPreviewLabel(rank, handRankSealed);
    } else {
      scene._handText?.setVisible(false);
      scene.playerUI?.highlightHand(null);
      scene.itemUI?.rattleRelics([]);
    }

    // DEBUG 점수 표시
    scene.previewScoreTxt?.setText(score > 0 ? `score: ${score}` : '');
  }

  /**
   * 배틀 로그 추가 및 갱신
   */
  addBattleLog(text) {
    this.scene.battleLogUI?.addLog(text);
  }

  refreshBattleLog() {
    this.scene.battleLogUI?.refresh();
  }
}
