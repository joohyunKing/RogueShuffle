import Phaser from "phaser";
import roundData from '../data/round.json';

/**
 * GameScene — 흐름 컨트롤러
 *
 * 수신 데이터:
 *   { round, player?, deck?, phase?, battleIndex? }
 *
 * phase === 'market'  (기본값) → MarketScene
 * phase === 'battle'  → battleIndex에 따라 BattleScene (일반 or 보스)
 */
export class GameScene extends Phaser.Scene {
  constructor() { super("GameScene"); }

  create() {
    const data        = this.scene.settings.data || {};
    const round       = data.round       ?? 1;
    const player      = data.player      ?? null;
    const deck        = data.deck        ?? null;
    const phase       = data.phase       ?? 'market';
    const battleIndex = data.battleIndex ?? 0;

    // round.json에서 현재 라운드 데이터 조회 (범위 초과 시 마지막 라운드 사용)
    const rounds  = roundData.rounds;
    const rdIdx   = Math.min(round - 1, rounds.length - 1);
    const rd      = rounds[rdIdx];
    const normalCount = rd.normalCount;

    if (phase === 'market') {
      this.scene.start('MarketScene', { round, player, deck });
    } else {
      // battle phase
      if (battleIndex < normalCount) {
        // 일반 배틀
        this.scene.start('BattleScene', {
          round,
          player,
          deck,
          isBoss:      false,
          battleIndex,
          normalCount,
          monsterTier: rd.monsterTier,
          totalCost:   rd.totalCost,
        });
      } else if (battleIndex === normalCount) {
        // 보스 배틀
        this.scene.start('BattleScene', {
          round,
          player,
          deck,
          isBoss:      true,
          battleIndex,
          normalCount,
          monsterTier: rd.boss.monsterTier,
          totalCost:   rd.boss.totalCost,
        });
      } else {
        // 모든 배틀 완료 → 다음 라운드 (이미 BattleScene의 onBattleClear에서 처리됨)
        this.scene.start('GameScene', { round, player, deck });
      }
    }
  }
}
