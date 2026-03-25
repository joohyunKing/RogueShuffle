
import roundData from '../data/round.json';

export class RoundManager {
    constructor(data, startRound = 1) {
      this.roundData = data;
      this.currentRound = startRound;
      this.currentBattleIndex = 0;
      this.isBoss = false;
    }
  
    setRound(round) {
      this.currentRound = round;
      this.currentBattleIndex = 0;
      this.isBoss = false;
    }
  
    getRound() {
      return this.currentRound;
    }

    startNextRound() {
        this.currentRound++;
        this.currentBattleIndex = 0;
        this.isBoss = false;
    }

    getCurrentRoundData() {
        return this.roundData.rounds[this.currentRound - 1];
    }

    getNextBattle() {
        const round = this.getCurrentRoundData();

        // 일반 몬스터
        if (this.currentBattleIndex < round.normalCount) {
            this.isBoss = false;
            this.currentBattleIndex++;

            return {
                type: "normal",
                tier: round.monsterTier,
                cost: round.totalCost
            };
        }

        // 보스전
        if (!this.isBoss) {
            this.isBoss = true;

            return {
                type: "boss",
                tier: round.boss.monsterTier,
                cost: round.boss.totalCost
            };
        }

        // 라운드 종료
        return null;
    }
}
