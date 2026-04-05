import Phaser from 'phaser';
import { GW, GH, PLAYER_PANEL_W, MONSTER_AREA_TOP, MONSTER_AREA_H } from '../constants.js';
import { TS } from '../textStyles.js';

const ACTION_GAP = 1600; // 액션 간 딜레이(ms)

export class BossManager {
  constructor(scene) {
    this.scene = scene;
    this._debuffInitialized = false; // 첫 플레이어 턴 디버프 초기화 여부
  }

  // ── 현재 페이즈 판단 ─────────────────────────────────────────────────────
  getCurrentPhase(boss) {
    const ratio  = boss.hp / boss.maxHp;
    // hpThreshold 내림차순 정렬 후 ratio >= threshold 인 첫 번째 반환
    const sorted = [...boss.phases].sort((a, b) => b.hpThreshold - a.hpThreshold);
    return sorted.find(p => ratio >= p.hpThreshold) ?? sorted[sorted.length - 1];
  }

  // ── 패시브 활성화 (trigger: 'boss_turn' | 'player_turn') ─────────────────
  activatePassive(boss, trigger) {
    const { scene } = this;

    // player_turn 시작 시: 디버프 타입 보스가 첫 턴에 디버프 없으면 1페이즈 디버프 초기화
    if (trigger === 'player_turn') {
      this._initDebuffIfNeeded(boss);
    }

    const p = boss.passive;
    if (!p || p.triggerOn !== trigger) return;

    if (p.type === 'atk_per_turn') {
      const gain = Math.floor(p.value * boss.statMulti);
      boss.atk += gain;
      scene.addBattleLog(`[패시브] ${boss.name} ATK +${gain} (총 ${boss.atk})`);
    }

    if (p.type === 'def_multiply_when_summoned') {
      const summonedAlive = scene.monsters.filter(m => m.isSummoned && !m.isDead);
      boss.def = summonedAlive.length > 0
        ? Math.floor(boss.baseDef * p.value)
        : boss.baseDef;
    }

    if (p.type === 'def_multiply_when_healthy') {
      const ratio = boss.hp / boss.maxHp;
      boss.def = ratio >= p.threshold
        ? Math.floor(boss.baseDef * p.value)
        : boss.baseDef;
    }
  }

  // ── 보스 턴 패시브 적용 (하위 호환용 래퍼) ───────────────────────────────
  applyPassive(boss) {
    this.activatePassive(boss, 'boss_turn');
  }

  // ── 디버프 초기화 (첫 플레이어 턴에 한 번만 조용히 적용) ────────────────────
  _initDebuffIfNeeded(boss) {
    // 한 번 초기화하면 이후 재적용 안 함 (tick 만료 후 재적용 방지)
    if (this._debuffInitialized) return;

    const { scene } = this;
    const DEBUFF_SKILL_TYPES = ['rank_disable', 'suit_disable', 'seal_most_used_hand', 'seal_most_and_last_hand'];

    // 해당 보스가 디버프 스킬을 가졌는지 확인
    const phase1 = [...boss.phases].sort((a, b) => b.hpThreshold - a.hpThreshold)[0];
    const hasDebuffSkill = (phase1?.actions ?? []).some(a =>
      a.type === 'skill' && DEBUFF_SKILL_TYPES.includes(boss.skills?.[a.skillId]?.type)
    );
    if (!hasDebuffSkill) return;

    for (const action of (phase1?.actions ?? [])) {
      if (action.type !== 'skill') continue;
      const skill = boss.skills?.[action.skillId];
      if (!skill || !DEBUFF_SKILL_TYPES.includes(skill.type)) continue;

      // 재진입 방지를 위해 플래그를 먼저 설정 (apply 내부에서 render() 호출 시 무한루프 방지)
      this._debuffInitialized = true;
      if (skill.type === 'rank_disable')            scene.debuffManager.applyRankDisable(boss.name);
      if (skill.type === 'suit_disable')            scene.debuffManager.applySuitDisable(boss.name);
      if (skill.type === 'seal_most_used_hand')     scene.debuffManager.applyMostUsedHandSeal(boss.name);
      if (skill.type === 'seal_most_and_last_hand') scene.debuffManager.applyMostAndLastHandSeal(boss.name);
      break;
    }
  }

  // ── 보스 턴 실행 ─────────────────────────────────────────────────────────
  // 패시브 → 페이즈 액션 순서대로 실행, 완료 후 onDone() 호출
  doTurn(boss, onDone) {
    const { scene } = this;
    const monIdx = 0; // 보스는 항상 index 0

    // 1. 패시브
    this.applyPassive(boss);
    scene.refreshPlayerStats();
    scene.refreshBattleLog();

    // 2. 페이즈 액션 순차 실행
    const phase   = this.getCurrentPhase(boss);
    const actions = phase.actions;

    actions.forEach((action, i) => {
      scene.time.delayedCall(i * ACTION_GAP + 200, () => {
        this._executeAction(boss, monIdx, action);
        scene.refreshPlayerStats();
        scene.refreshBattleLog();
      });
    });

    // 3. 완료 콜백
    scene.time.delayedCall(actions.length * ACTION_GAP + 500, () => {
      onDone?.();
    });
  }

  // ── 액션 분기 ─────────────────────────────────────────────────────────────
  _executeAction(boss, monIdx, action) {
    if (action.type === 'attack') {
      this._doAttack(boss, monIdx);
    } else if (action.type === 'skill') {
      this._doSkill(boss, monIdx, action.skillId);
    } else if (action.type === 'summon_or_attack') {
      this._doSummonOrAttack(boss, monIdx);
    }
  }

  // ── 소환(부활) 또는 공격 ──────────────────────────────────────────────────
  _doSummonOrAttack(boss, monIdx) {
    const { scene } = this;
    const deadSummoned = scene.monsters.find(m => m.isSummoned && m.isDead);
    if (deadSummoned) {
      this._doRevive(boss, monIdx, deadSummoned);
    } else {
      this._doAttack(boss, monIdx);
    }
  }

  // ── 소환 몬스터 부활 ────────────────────────────────────────────────────
  _doRevive(boss, monIdx, target) {
    const { scene } = this;

    target.isDead = false;
    target.hp     = Math.floor(target.maxHp * 0.5);
    target.state  = 'idle';

    // 스프라이트 idle 재생
    const targetIdx = scene.monsters.indexOf(target);
    const sprite    = scene._monsterSprites?.[targetIdx];
    if (sprite instanceof Phaser.GameObjects.Sprite) {
      const idleKey = `${target.id}_idle`;
      if (scene.anims.exists(idleKey)) sprite.play(idleKey);
    }

    this._playAnim(boss, monIdx, 'skill');
    scene.renderMonsters();
    scene.addBattleLog(`${boss.name}의 부활! ${target.name} 재생!`);
    this._showSummonEffect(monIdx);
  }

  // ── 보스 스프라이트 Y 위치 ────────────────────────────────────────────────
  _getMonSpritePos(monIdx) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;
    const sprite = scene._monsterSprites?.[monIdx];
    const mY = sprite instanceof Phaser.GameObjects.Sprite
      ? sprite.y - 30
      : MONSTER_AREA_TOP + MONSTER_AREA_H / 2;
    return { mX, mY };
  }

  // ── 일반 공격 ────────────────────────────────────────────────────────────
  _doAttack(boss, monIdx) {
    const { scene } = this;
    const dmg = Math.max(0, boss.atk - scene.player.def);
    scene.player.hp = Math.max(0, scene.player.hp - dmg);
    scene.addBattleLog(`${boss.name}의 공격! ${dmg} 데미지!`);
    this._playAnim(boss, monIdx, 'attack');
    const { mX, mY } = this._getMonSpritePos(monIdx);
    scene.effects.throwOrb(mX, mY, PLAYER_PANEL_W / 2, 152, 0xff4444);
    this._showHitFlash(monIdx, dmg, 0xcc0000, false);
  }

  // ── 스킬 ────────────────────────────────────────────────────────────────
  _doSkill(boss, monIdx, skillId) {
    const { scene } = this;
    const skill = boss.skills?.[skillId];
    if (!skill) return;

    this._playAnim(boss, monIdx, 'skill');

    if (skill.type === 'damage') {
      // 강력한 데미지: boss.atk * damMult
      const raw = Math.floor(boss.atk * (skill.damMult ?? 1));
      const dmg = Math.max(0, raw - scene.player.def);
      scene.player.hp = Math.max(0, scene.player.hp - dmg);
      scene.addBattleLog(`${boss.name}의 ${skill.name}! ${dmg} 강력한 데미지!`);
      const { mX: dmX, mY: dmY } = this._getMonSpritePos(monIdx);
      scene.effects.throwOrb(dmX, dmY, PLAYER_PANEL_W / 2, 152, 0xff2222);
      this._showHitFlash(monIdx, dmg, 0xff2222, true);

    } else if (skill.type === 'buff') {
      // 자신 버프: stat 증가 (value * statMulti)
      const val = Math.floor(skill.value * boss.statMulti);
      boss[skill.stat] = (boss[skill.stat] ?? 0) + val;
      scene.addBattleLog(`${boss.name}의 ${skill.name}! ${skill.stat.toUpperCase()} +${val}`);
      this._showBuffEffect(monIdx);

    } else if (skill.type === 'debuff') {
      scene.debuffManager.applyDebuff(skill.debuffId, boss.name);
      scene.render();
      this._showDebuffFlash(monIdx);
      const { mX: dbX, mY: dbY } = this._getMonSpritePos(monIdx);
      scene.effects.throwOrb(dbX, dbY, PLAYER_PANEL_W + 24, MONSTER_AREA_TOP + 58, 0xaa44ff);

    } else if (skill.type === 'heal_lost_hp') {
      const lost   = boss.maxHp - boss.hp;
      const amount = Math.max(1, Math.floor(lost * skill.ratio));
      boss.hp = Math.min(boss.maxHp, boss.hp + amount);
      scene.addBattleLog(`${boss.name}의 ${skill.name}! +${amount} HP`);
      this._showHealEffect(monIdx, amount);

    } else if (skill.type === 'rank_disable') {
      scene.debuffManager.applyRankDisable(boss.name);
      this._showDebuffFlash(monIdx);
      const { mX: rkX, mY: rkY } = this._getMonSpritePos(monIdx);
      scene.effects.throwOrb(rkX, rkY, PLAYER_PANEL_W + 24, MONSTER_AREA_TOP + 58, 0xaa44ff);

    } else if (skill.type === 'suit_disable') {
      scene.debuffManager.applySuitDisable(boss.name);
      this._showDebuffFlash(monIdx);
      const { mX: stX, mY: stY } = this._getMonSpritePos(monIdx);
      scene.effects.throwOrb(stX, stY, PLAYER_PANEL_W + 24, MONSTER_AREA_TOP + 58, 0xaa44ff);

    } else if (skill.type === 'seal_most_used_hand') {
      scene.debuffManager.applyMostUsedHandSeal(boss.name);
      this._showDebuffFlash(monIdx);
      const { mX: m1X, mY: m1Y } = this._getMonSpritePos(monIdx);
      scene.effects.throwOrb(m1X, m1Y, PLAYER_PANEL_W + 24, MONSTER_AREA_TOP + 58, 0xaa44ff);

    } else if (skill.type === 'seal_most_and_last_hand') {
      scene.debuffManager.applyMostAndLastHandSeal(boss.name);
      this._showDebuffFlash(monIdx);
      const { mX: m2X, mY: m2Y } = this._getMonSpritePos(monIdx);
      scene.effects.throwOrb(m2X, m2Y, PLAYER_PANEL_W + 24, MONSTER_AREA_TOP + 58, 0xaa44ff);
    }
  }

  // ── 디버프 플래시 (트릭스터용) ────────────────────────────────────────────
  _showDebuffFlash(monIdx) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x224400, 0.30).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
    scene._sfx('sfx_chop');

    const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, 'SEAL!',
      { fontFamily: "'PressStart2P',Arial", fontSize: '14px', color: '#aaff44', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(501);
    scene.tweens.add({ targets: txt, y: txt.y - 55, alpha: 0, duration: 650, delay: 80, ease: 'Power2.Out', onComplete: () => txt.destroy() });
  }

  // ── 애니메이션 재생 ──────────────────────────────────────────────────────
  _playAnim(boss, monIdx, animType) {
    const { scene } = this;
    const monSprite = scene._monsterSprites?.[monIdx];
    if (!(monSprite instanceof Phaser.GameObjects.Sprite)) return;

    const key     = `${boss.id}_${animType}`;
    const playKey = scene.anims.exists(key) ? key : `${boss.id}_attack`;
    const idleKey = `${boss.id}_idle`;

    if (scene.anims.exists(playKey)) {
      monSprite.play(playKey);
      monSprite.once('animationcomplete', () => {
        if (scene.anims.exists(idleKey)) monSprite.play(idleKey);
      });
    }
  }

  // ── 피격 플래시 ──────────────────────────────────────────────────────────
  _showHitFlash(monIdx, damage, color, isSkill) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    const alpha    = isSkill ? 0.4 : 0.25;
    const duration = isSkill ? 600 : 480;
    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, color, alpha).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration, onComplete: () => flash.destroy() });
    scene._sfx(isSkill ? 'sfx_knifeSlice' : 'sfx_chop');

    const label = damage > 0 ? `-${damage} HP` : 'BLOCKED!';
    const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H + 8, label, TS.damageHit)
      .setOrigin(0.5, 0).setDepth(501);
    if (isSkill) txt.setTint(color);
    scene.tweens.add({ targets: txt, y: 128, alpha: 0, duration: 480, delay: 80, ease: 'Power1.In', onComplete: () => txt.destroy() });
  }

  // ── 버프 이펙트 ──────────────────────────────────────────────────────────
  _showBuffEffect(monIdx) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x4488ff, 0.20).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
    scene._sfx('sfx_chop');

    const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, 'BUFF!',
      { fontFamily: "'PressStart2P',Arial", fontSize: '14px', color: '#88aaff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(501);
    scene.tweens.add({ targets: txt, y: txt.y - 50, alpha: 0, duration: 600, delay: 100, ease: 'Power2.Out', onComplete: () => txt.destroy() });
  }

  // ── 소환 이펙트 ──────────────────────────────────────────────────────────
  _showSummonEffect(monIdx) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x9900ff, 0.18).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
    scene._sfx('sfx_shuffle');

    const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, 'SUMMON!',
      { fontFamily: "'PressStart2P',Arial", fontSize: '13px', color: '#dd88ff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(501);
    scene.tweens.add({ targets: txt, y: txt.y - 60, alpha: 0, duration: 700, delay: 80, ease: 'Power2.Out', onComplete: () => txt.destroy() });
  }

  // ── 힐 이펙트 (트롤용) ───────────────────────────────────────────────────
  _showHealEffect(monIdx, amount) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x004400, 0.25).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
    scene._sfx('sfx_chop');

    const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, `+${amount} HP`,
      { fontFamily: "'PressStart2P',Arial", fontSize: '13px', color: '#44ff88', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(501);
    scene.tweens.add({ targets: txt, y: txt.y - 55, alpha: 0, duration: 700, delay: 80, ease: 'Power2.Out', onComplete: () => txt.destroy() });

    // HP바 갱신
    scene.renderMonsters();
  }
}
