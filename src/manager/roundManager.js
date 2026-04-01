// roundManager.js

import roundDataJson from '../data/round.json';

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export class RoundManager {
    constructor() {
        this.rounds = roundDataJson.rounds || [];
    }

    /**
     * 라운드 + 전투 인덱스 기반 데이터 반환
     * @param {number} round
     * @param {number} battleIndex
     */
    getRoundData(round, battleIndex) {
        const roundData = this.rounds.find(r => r.round === round ?? 1);

        const battle = roundData.battles?.[battleIndex ?? 0];

        const isBoss = battle.type === 'boss';

        const result = {
            round,
            battleIndex,
            bg: roundData.bg,

            baseStat: {
                hp: roundData.baseStat.hp,
                atk: roundData.baseStat.atk,
                def: roundData.baseStat.def
            },

            battleInfo: {
                type: battle.type,
                statMulti: battle.statMulti,
                totalCost: battle.totalCost
            },

            isBoss,

            // 일반 전투용
            races: isBoss ? null : (roundData.races || []),

            // 보스용
            bossId: isBoss ? randomPick(roundData.bossPool || []) : null,
            bossDebuff: isBoss ? (roundData.bossDebuff || {}) : null
        };

        return result;
    }

    /**
     * 보상 계산 (battle 기반)
     */
    getReward(roundData) {
        const { round, battleInfo } = roundData;

        const multi = battleInfo?.statMulti || 1;

        return {
            gold: Math.floor(10 + round * 2 * multi),
            xp: Math.floor(5 + round * 1.5 * multi)
        };
    }

    /**
     * battle 타입 가져오기
     */
    getBattleType(round, battleIndex) {
        const roundData = this.getRoundData(round, battleIndex);
        return roundData.battleInfo.type;
    }

    /**
     * 해당 라운드 총 전투 수
     */
    getBattleCount(round) {
        const roundData = this.rounds.find(r => r.round === round);
        return roundData?.battles?.length || 0;
    }

    /**
     * 보스 인덱스 찾기 (유용함)
     */
    getBossBattleIndex(round) {
        const roundData = this.rounds.find(r => r.round === round);
        return roundData.battles.findIndex(b => b.type === 'boss');
    }

    /**
     * 다음 진행 단계 계산
     * @param {number} round
     * @param {number} battleIndex
     */
    getNextStep(round, battleIndex) {
        const roundData = this.rounds.find(r => r.round === round);

        if (!roundData) {
            throw new Error(`Round ${round} not found`);
        }

        const nextIndex = battleIndex + 1;
        const battleCount = roundData.battles.length;

        // ✅ 같은 라운드 내 다음 전투
        if (nextIndex < battleCount) {
            return {
                round,
                battleIndex: nextIndex,
                isNextRound: false,
                isGameEnd: false
            };
        }

        // ✅ 다음 라운드로 이동
        const nextRound = round + 1;

        if (this.hasRound(nextRound)) {
            return {
                round: nextRound,
                battleIndex: 0,
                isNextRound: true,
                isGameEnd: false
            };
        }

        // ✅ 게임 종료
        return {
            round,
            battleIndex,
            isNextRound: false,
            isGameEnd: true
        };
    }
}

export const roundManager = new RoundManager();