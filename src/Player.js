/**
 * Player.js
 * 플레이어 상태 관리 클래스.
 * 씬 전환 시 player.toData() 로 직렬화하여 넘깁니다.
 */

/**
 * 레벨업에 필요한 경험치를 반환합니다.
 * @param {number} level
 * @returns {number}
 */
export function getRequiredExp(level) {
  level = level * 1;
  return Math.floor((level * level + level + 14) / 2);
}

export class Player {
  /**
   * @param {object} [data] - 이전 씬에서 넘긴 직렬화 데이터 (없으면 초기값)
   */
  constructor(data = {}) {
    this.hp             = data.hp             ?? 100;
    this.maxHp          = data.maxHp          ?? 100;
    this.def            = data.def            ?? 0;
    this.score          = data.score          ?? 0;
    this.xp             = data.xp             ?? 0;
    this.gold           = data.gold           ?? 0;
    this.level          = data.level          ?? 1;
    /** 턴당 공격 가능 횟수 */
    this.attacksPerTurn = data.attacksPerTurn ?? 2;
    /** 슈트별 레벨 { S, H, D, C } */
    this.attrs          = data.attrs          ?? { S: 1, H: 1, D: 1, C: 1 };
  }

  /** 현재 레벨에서 레벨업에 필요한 총 경험치 */
  get requiredXp() {
    return getRequiredExp(this.level);
  }

  /**
   * 경험치를 추가하고 레벨업을 처리합니다.
   * @param {number} amount
   * @returns {number[]} 새로 획득한 레벨 배열 (레벨업 없으면 [])
   */
  addXp(amount) {
    this.xp += amount;
    const gained = [];
    while (this.xp >= getRequiredExp(this.level)) {
      this.xp -= getRequiredExp(this.level);
      this.level++;
      gained.push(this.level);
    }
    return gained;
  }

  /** 씬 전환용 직렬화 */
  toData() {
    return {
      hp:             this.hp,
      maxHp:          this.maxHp,
      def:            this.def,
      score:          this.score,
      xp:             this.xp,
      gold:           this.gold,
      level:          this.level,
      attacksPerTurn: this.attacksPerTurn,
      attrs:          { ...this.attrs },
    };
  }
}
