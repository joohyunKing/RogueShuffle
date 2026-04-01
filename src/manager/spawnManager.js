import monsterJson from '../data/monsters.json';

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
            return [this.createBoss(roundData)];
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

        const baseXp =  4 + (roundData.round * 2);
        const baseGold = 2 + (roundData.round * 1.5);

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

        switch(race) {
            case "human": result = {"hp":1.0, "atk":1.0, "def":1.0};break;
            case "undead": result = {"hp":0.8, "atk":1.2, "def":0.9};break;
            case "beast": result = {"hp":1.2, "atk":1.0, "def":0.9};break;
            default: result = {"hp":1.0, "atk":1.0, "def":1.0};
        }

        return result;
    }

    getJobStatMult(job) {
        let result = {};

        switch(job) {
            case "warrior": result = {"hp":1.1, "atk":1.1, "def":0.8};break;
            case "archer": result = {"hp":0.9, "atk":1.4, "def":0.7};break;
            case "lancer": result = {"hp":1.1, "atk":0.8, "def":1.1};break;
            case "knight": result = {"hp":1.2, "atk":1.2, "def":1.5};break;
            case "mage": result = {"hp":0.8, "atk":1.7, "def":0.8};break;
            default: result = {"hp":1.0, "atk":1.0, "def":1.0};
        }

        return result;
    }

    /**
     * 보스 생성 (임시)
     */
    createBoss(roundData) {
        const base = roundData.baseStat;
        const multi = roundData.battleInfo.statMulti;

        return {
            id: roundData.bossId,
            isBoss: true,

            hp: Math.floor(base.hp * multi),
            atk: Math.floor(base.atk * multi),
            def: Math.floor(base.def * multi)
        };
    }
}

export const spawnManager = new SpawnManager();