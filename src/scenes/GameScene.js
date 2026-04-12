import Phaser from "phaser";

import { roundManager } from '../manager/roundManager.js';
import { DEBUG_MODE } from "../constants.js";

/**
 * GameScene — 흐름 컨트롤러
 *
 * 수신 데이터:
 *   { round, player?, deck?, battleIndex?, battleLog? }
 *
 * roundData : {
      round: 4,
      battleIndex: 1,
      bg: "04_old_stone_castle.jpg",
      baseStat: { hp: 76, atk: 10, def: 6 },
      battleInfo: { type: "elite", statMulti: 1.6, totalCost: 3 },
      isBoss: false,
      races: ["undead", "beast"]
    }
 */
export class GameScene extends Phaser.Scene {
  constructor() { super("GameScene"); }

  create() {
    const data = this.scene.settings.data || {};
    const round = data.round ?? 1;
    const player = data.player ?? null;
    const deck = data.deck ?? null;
    const battle = data.battle ?? null;
    const battleIndex = data.battleIndex ?? battle?.battleIndex ?? 0;
    const battleLog = data.battleLog ?? [];

    const roundData = roundManager.getRoundData(round, battleIndex);
    if (!roundData) {
      console.error(`[GameScene] roundData not found (round=${round}, battleIndex=${battleIndex})`);
      this.scene.start('MainMenuScene');
      return;
    }

    switch (roundData.battleInfo.type) {
      case 'market':
        this.scene.start('MarketScene', { round, player, deck, battleIndex, battleLog });
        break;

      case 'normal':
      case 'elite':
      case 'boss':
        this.scene.start('BattleScene', {
          round, battleIndex, player, deck, roundData, battleLog,
          monsters: battle?.monsters ?? null,
        });
        break;
    }
  }
}
