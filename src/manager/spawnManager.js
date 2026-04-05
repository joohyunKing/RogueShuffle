import monsterJson from '../data/monsters.json';
import bossData from '../data/boss.json';
import { roundManager } from './roundManager.js';

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export class SpawnManager {
    constructor() {
        this.monsters = monsterJson.monsters || [];
    }

    /**
     * 메인 진입
     */
    generate(roundData) {
        if (roundData.isBoss) {
            return this.createBossGroup(roundData);
        }

        const { totalCost, statMulti, type } = roundData.battleInfo;

        let pool = this.getMonsterPool(roundData);

        // 👉 elite 보정
        if (type === 'elite') {
            pool = this.applyEliteRule(pool);
        }

        const picks = this.pickByCost(pool, totalCost);

        return picks.map(m => this.createMonster(m, roundData, statMulti));
    }

    /**
     * race 기반 필터
     */
    getMonsterPool(roundData) {
        return this.monsters.filter(m =>
            roundData.races.includes(m.race)
        );
    }

    /**
     * cost 기반 조합 생성
     */
    pickByCost(pool, totalCost) {
        let remaining = totalCost;
        const result = [];
        const countMap = {}; // 다양성 제한

        while (remaining > 0) {
            const candidates = pool.filter(m =>
                m.cost <= remaining &&
                (countMap[m.id] || 0) < 2 // 👉 같은 몬스터 최대 2마리
            );

            if (candidates.length === 0) break;

            const pick = randomPick(candidates);

            result.push(pick);

            countMap[pick.id] = (countMap[pick.id] || 0) + 1;
            remaining -= pick.cost;
        }

        return result;
    }

    /**
     * elite 전투 보정
     * 👉 최소 cost 2 하나 포함
     */
    applyEliteRule(pool) {
        const hasCost2 = pool.some(m => m.cost === 2);

        if (!hasCost2) return pool;

        // cost 2 우선 확률 ↑
        return [
            ...pool,
            ...pool.filter(m => m.cost === 2),
            ...pool.filter(m => m.cost === 2)
        ];
    }

    /**
     * 몬스터 스탯 계산
     */
    createMonster(monsterData, roundData, statMulti) {
        const base = roundData.baseStat;
        const rnd = () => 0.9 + Math.random() * 0.2;

        const raceMult = this.getRaceStatMult(monsterData.race) || { hp: 1, atk: 1, def: 1 };
        const jobMult = this.getJobStatMult(monsterData.job) || { hp: 1, atk: 1, def: 1 };

        const baseXp = 4 + roundData.round;
        const baseGold = 2 + (roundData.round * 0.5);

        const hp = Math.floor(base.hp * statMulti * raceMult.hp * jobMult.hp * rnd());

        return {
            id: monsterData.id,
            name: monsterData.name,
            race: monsterData.race,
            job: monsterData.job,

            // 최종 공식: (라운드기본 * 배틀계수 * 종족계수 * 직업계수 * 랜덤)
            hp: hp,
            maxHp: hp,
            atk: Math.floor(base.atk * statMulti * raceMult.atk * jobMult.atk * rnd()),
            def: Math.floor(base.def * statMulti * raceMult.def * jobMult.def * rnd()),

            skill: monsterData.skill || null,
            sprite: monsterData.sprite,

            xp: Math.floor(baseXp * statMulti * rnd()),
            gold: Math.floor(baseGold * statMulti * rnd())
        };
    }

    getRaceStatMult(race) {
        let result = {};

        switch (race) {
            case "human": result = { "hp": 1.0, "atk": 1.0, "def": 1.0 }; break;
            case "skell": result = { "hp": 0.8, "atk": 1.2, "def": 0.9 }; break;
            case "undead": result = { "hp": 0.8, "atk": 1.2, "def": 0.9 }; break;
            case "orc": result = { "hp": 1.2, "atk": 1.0, "def": 0.9 }; break;
            default: result = { "hp": 1.0, "atk": 1.0, "def": 1.0 };
        }

        return result;
    }

    getJobStatMult(job) {
        let result = {};

        switch (job) {
            case "warrior": result = { "hp": 1.1, "atk": 1.1, "def": 0.8 }; break;
            case "archer": result = { "hp": 0.9, "atk": 1.4, "def": 0.7 }; break;
            case "lancer": result = { "hp": 1.1, "atk": 0.8, "def": 1.1 }; break;
            case "knight": result = { "hp": 1.2, "atk": 1.2, "def": 1.5 }; break;
            case "mage": result = { "hp": 0.8, "atk": 1.7, "def": 0.8 }; break;
            default: result = { "hp": 1.0, "atk": 1.0, "def": 1.0 };
        }

        return result;
    }

    /**
     * 보스 그룹 생성 (보스 + boss.json summons 정의 몬스터)
     */
    createBossGroup(roundData) {
        const boss = this.createBoss(roundData);
        const template = bossData.bosses.find(b => b.id === boss.id);
        if (!template?.summons?.length) return [boss];

        // 해당 라운드 첫 번째 non-market 배틀 스탯으로 소환 몬스터 생성
        const rawRound = roundManager.rounds.find(r => r.round === roundData.round);
        const firstBattle = rawRound?.battles.find(b => b.statMulti != null);
        const summonStatMulti = firstBattle?.statMulti ?? 1.0;
        const summonRoundData = { round: roundData.round, baseStat: roundData.baseStat };

        const summons = [];
        for (const s of template.summons) {
            const monData = this.monsters.find(m => m.id === s.monsterId);
            if (!monData) continue;
            for (let i = 0; i < (s.count ?? 1); i++) {
                const mon = this.createMonster(monData, summonRoundData, summonStatMulti);
                mon.isSummoned = true;
                mon.state = 'idle';
                summons.push(mon);
            }
        }

        return [boss, ...summons];
    }

    /**
     * 보스 생성
     */
    createBoss(roundData) {
        const base = roundData.baseStat;
        const multi = roundData.battleInfo.statMulti;
        const bossId = roundData.bossId;

        const template = bossData.bosses.find(b => b.id === bossId);
        if (!template) {
            console.warn(`Boss "${bossId}" not found in boss.json`);
            const hp = Math.floor(base.hp * multi);
            return {
                id: bossId, name: bossId, isBoss: true, hp, maxHp: hp,
                atk: Math.floor(base.atk * multi), def: Math.floor(base.def * multi),
                phases: [], passive: null, skills: {}, statMulti: multi
            };
        }

        const scale = template.statScale ?? { hp: 1, atk: 1, def: 1 };
        const hp = Math.floor(base.hp * multi * scale.hp);
        const def = Math.floor(base.def * multi * scale.def);

        return {
            id: template.id,
            name: template.name,
            isBoss: true,
            sprite: template.sprite,

            hp, maxHp: hp,
            atk: Math.floor(base.atk * multi * scale.atk),
            def,
            baseDef: def,

            phases: template.phases,
            passive: template.passive,
            skills: template.skills,
            statMulti: multi,

            xp: Math.floor((4 + roundData.round) * multi * 3),
            gold: Math.floor((2 + roundData.round * 0.5) * multi * 3),
        };
    }
}

export const spawnManager = new SpawnManager();