import { 
  GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W, 
  FIELD_Y, HAND_Y, FIELD_CW, FIELD_CH, CH, CW 
} from "../constants.js";
import { getLang, getHandName } from "../service/langService.js";

/**
 * BattleUIManager - 전투 중의 각종 UI 구성 요소들을 관리하고 갱신
 */
export class BattleUIManager {
  constructor(scene) {
    this.scene = scene;
  }

  // ── 위치 계산 (Layout) ──────────────────────────────────────────────────────────

  calcFieldPositions(count) {
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;   // 880
    const gap = 14;
    const areaW = FAW - 140;               // deck/dummy 파일 공간 제외: 740
    const totalW = count * FIELD_CW + (count - 1) * gap;
    const x0 = PW + 40 + FIELD_CW / 2 + (areaW - totalW) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (FIELD_CW + gap), y: FIELD_Y }));
  }

  calcHandPositions(count) {
    if (count === 0) return [];
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;   // 880
    const gap = 10;
    const areaW = FAW - 85;               // 795
    const baseW = Math.round(CW * 0.85);
    const scale = count >= 9 ? Math.max(0.65, 8 / count) : 1;
    const cardW = Math.round(baseW * scale);
    const spacing = count === 1 ? 0 : Math.min(cardW + gap, (areaW - cardW) / (count - 1));
    const x0 = PW + 40 + cardW / 2 + (areaW - (cardW + spacing * (count - 1))) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * spacing, y: HAND_Y }));
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
