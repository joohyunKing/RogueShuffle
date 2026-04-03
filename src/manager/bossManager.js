import Phaser from 'phaser';
import { GW, GH, MONSTER_AREA_TOP, MONSTER_AREA_H } from '../constants.js';
import { TS } from '../textStyles.js';

const ACTION_GAP = 850; // 액션 간 딜레이(ms)

export class BossManager {
  constructor(scene) {
    this.scene = scene;
  }

  // ── 현재 페이즈 판단 ─────────────────────────────────────────────────────
  getCurrentPhase(boss) {
    const ratio  = boss.hp / boss.maxHp;
    // hpThreshold 내림차순 정렬 후 ratio >= threshold 인 첫 번째 반환
    const sorted = [...boss.phases].sort((a, b) => b.hpThreshold - a.hpThreshold);
    return sorted.find(p => ratio >= p.hpThreshold) ?? sorted[sorted.length - 1];
  }

  // ── 패시브 적용 ──────────────────────────────────────────────────────────
  applyPassive(boss) {
    const { scene } = this;
    const p = boss.passive;
    if (!p) return;

    if (p.type === 'atk_per_turn') {
      const gain = Math.floor(p.value * boss.statMulti);
      boss.atk += gain;
      scene.addBattleLog(`[패시브] ${boss.name} ATK +${gain} (총 ${boss.atk})`);
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
    }
  }

  // ── 일반 공격 ────────────────────────────────────────────────────────────
  _doAttack(boss, monIdx) {
    const { scene } = this;
    const dmg = Math.max(0, boss.atk - scene.player.def);
    scene.player.hp = Math.max(0, scene.player.hp - dmg);
    scene.addBattleLog(`${boss.name}의 공격! ${dmg} 데미지!`);
    this._playAnim(boss, monIdx, 'attack');
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
      scene.addBattleLog(`${boss.name}의 ${skill.name}!`);
      scene._sfx('sfx_chop');
    }
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
}
