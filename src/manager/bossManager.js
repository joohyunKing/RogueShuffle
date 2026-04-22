import Phaser from 'phaser';
import { GW, GH, PLAYER_PANEL_W, MONSTER_AREA_TOP, MONSTER_AREA_H } from '../constants.js';
import { TS } from '../textStyles.js';

const ACTION_GAP = 1600; // 액션 간 딜레이(ms)

// ── Orb 목표 좌표 ─────────────────────────────────────────────────────────────
const ATK_ORB = { x: PLAYER_PANEL_W / 2, y: 152 };
const DEBUFF_ORB = { x: PLAYER_PANEL_W + 24, y: MONSTER_AREA_TOP + 58 };

// ── 이펙트 프리셋 (flash + sfx + 떠오르는 텍스트) ──────────────────────────────
const EFFECT = {
  hit: { color: 0xcc0000, alpha: 0.25, duration: 480, sfx: 'sfx_chop' },
  skill: { color: 0xff2222, alpha: 0.40, duration: 600, sfx: 'sfx_knifeSlice' },
  debuff: { color: 0x224400, alpha: 0.30, duration: 600, sfx: 'sfx_chop', label: 'SEAL!', labelColor: '#aaff44' },
  buff: { color: 0x4488ff, alpha: 0.20, duration: 500, sfx: 'sfx_chop', label: 'BUFF!', labelColor: '#88aaff' },
  summon: { color: 0x9900ff, alpha: 0.18, duration: 600, sfx: 'sfx_shuffle', label: 'SUMMON!', labelColor: '#dd88ff' },
  heal: { color: 0x004400, alpha: 0.25, duration: 600, sfx: 'sfx_chop' },
};

// ── 디버프 스킬 타입 → debuffManager 메서드 매핑 ─────────────────────────────
// 새 디버프 스킬 추가 시 여기만 수정하면 _doSkill, _initDebuffIfNeeded 자동 반영
const DEBUFF_APPLIERS = {
  debuff: (dm, name, skill) => dm.applyDebuff(skill.debuffId, name),
  rank_disable: (dm, name) => dm.applyRankDisable(name),
  suit_disable: (dm, name) => dm.applySuitDisable(name),
  seal_most_used: (dm, name) => dm.applyMostUsedHandSeal(name),
  seal_most_and_last: (dm, name) => dm.applyMostAndLastHandSeal(name),
};


export class BossManager {
  constructor(scene) {
    this.scene = scene;
    this._debuffInitialized = false; // 첫 플레이어 턴 디버프 초기화 여부
  }

  // ── 현재 페이즈 판단 ─────────────────────────────────────────────────────
  getCurrentPhase(boss) {
    if (!boss || !boss.phases) return null;
    const ratio = boss.hp / boss.maxHp;
    const sorted = [...boss.phases].sort((a, b) => b.hpThreshold - a.hpThreshold);
    return sorted.find(p => ratio >= p.hpThreshold) ?? sorted[sorted.length - 1];
  }

  // ── 패시브 활성화 (trigger: 'boss_turn' | 'player_turn') ─────────────────
  activatePassive(boss, trigger) {
    const { scene } = this;

    if (trigger === 'player_turn') {
      this._initDebuffIfNeeded(boss);
    }

    // 1. 공통 패시브
    const globalPassives = Array.isArray(boss.passive) ? boss.passive : (boss.passive ? [boss.passive] : []);

    // 2. 페이즈별 특정 패시브
    const phase = this.getCurrentPhase(boss);
    const phasePassives = phase && phase.passive
      ? (Array.isArray(phase.passive) ? phase.passive : [phase.passive])
      : [];

    const allPassives = [...globalPassives, ...phasePassives];
    if (allPassives.length === 0) return;

    for (const p of allPassives) {
      if (p.triggerOn !== trigger) continue;
      this._applyPassiveEffect(boss, p);
    }

    this.refreshStatePassives(boss);
  }

  // HP나 소환수 상태 변화 시 호출하여 실시간으로 패시브 상태 반영
  refreshStatePassives(boss) {
    const globalPassives = Array.isArray(boss.passive) ? boss.passive : (boss.passive ? [boss.passive] : []);
    const phase = this.getCurrentPhase(boss);
    const phasePassives = phase?.passive ? (Array.isArray(phase.passive) ? phase.passive : [phase.passive]) : [];
    const allPassives = [...globalPassives, ...phasePassives];

    for (const p of allPassives) {
      // 실시간 대응이 필요한 패시브 타입들
      if (p.type === 'def_multiply_when_healthy' || p.type === 'def_multiply_when_summoned') {
        this._applyPassiveEffect(boss, p);
      }
    }
  }

  _applyPassiveEffect(boss, p) {
    const { scene } = this;
    const monIdx = scene.monsters.indexOf(boss);
    if (monIdx === -1) return;

    if (p.type === 'atk_per_turn') {
      const gain = Math.floor(p.value * (boss.statMulti ?? 1));
      boss.atk += gain;
      scene.addBattleLog(`[패시브] ${boss.name} ATK +${gain} (총 ${boss.atk})`);
      scene.renderMonsters();
    }

    if (p.type === 'def_multiply_when_summoned') {
      const summonedAlive = scene.monsters.filter(m => m.isSummoned && !m.isDead);
      boss.def = summonedAlive.length > 0
        ? Math.floor(boss.baseDef * p.value)
        : boss.baseDef;
    }

    if (p.type === 'def_multiply_when_healthy') {
      if (boss.baseDef === undefined) boss.baseDef = boss.def || 0;
      const ratio = boss.hp / boss.maxHp;
      const threshold = p.threshold ?? 0.5;
      const targetDef = ratio >= threshold
        ? Math.floor(boss.baseDef * p.value)
        : boss.baseDef;

      if (boss.def !== targetDef) {
        const lost = boss.def > targetDef;
        boss.def = targetDef;
        if (lost) {
          scene.addBattleLog(`[패시브] ${boss.name}의 방어막 약화! (HP ${Math.round(ratio * 100)}%)`);
          this._showEffect(monIdx, { ...EFFECT.debuff, label: 'SHIELD DOWN!', labelColor: '#ff4444' });
        } else {
          scene.addBattleLog(`[패시브] ${boss.name}의 방어막 강화!`);
          this._showEffect(monIdx, { ...EFFECT.buff, label: 'SHIELD UP!', labelColor: '#44ff44' });
        }
        scene.renderMonsters();
      }
    }

    // 플레이어 턴 동안 받은 데미지의 일부를 보스 턴 시작 시 회복
    if (p.type === 'reflect_heal') {
      const taken = boss._damageTaken ?? 0;
      boss._damageTaken = 0;
      const amount = Math.floor(taken * p.ratio);
      if (amount > 0) {
        boss.hp = Math.min(boss.maxHp, boss.hp + amount);
        scene.addBattleLog(`[반사] ${boss.name} ${amount} HP 흡수!`);
        this._showEffect(monIdx, { ...EFFECT.heal, label: `+${amount} HP`, labelColor: '#44ffcc' });
        scene.renderMonsters();
      }
    }

    if (p.type === 'plant_bombs') {
      const count = p.value || 3;
      this._plantBombs(count);
      scene.addBattleLog(`[패시브] ${boss.name}의 매설! 폭탄 ${count}장 추가!`);
      this._showEffect(monIdx, { color: 0xff4400, alpha: 0.35, duration: 600, sfx: 'sfx_explosion', label: `BOMB ×${count}!`, labelColor: '#ff6600' });
    }

    if (p.type === 'discard_deck') {
      const count = p.value || 3;
      const moved = scene.deck.deckPile.splice(0, count);
      scene.deck.dummyPile.push(...moved);
      scene.addBattleLog(`[패시브] ${boss.name}의 도살! ${moved.length}장 폐기!`);
      this._showEffect(monIdx, { ...EFFECT.debuff, label: `DISCARD ${moved.length}!`, labelColor: '#ff8844' });
      scene.refreshPlayerStats();
    }

    if (p.type === 'hand_flip') {
      const count = p.value || 2;
      const hand = scene.handData;
      const indices = [...Array(hand.length).keys()].filter(i => !hand[i].flipped);
      if (indices.length > 0) {
        Phaser.Utils.Array.Shuffle(indices);
        const picked = indices.slice(0, Math.min(count, indices.length));
        picked.forEach(idx => { hand[idx].flipped = true; });
        scene.addBattleLog(`[패시브] ${boss.name}의 간섭! ${picked.length}장 뒤집힘!`);
        this._showEffect(monIdx, { color: 0x9933cc, alpha: 0.30, duration: 600, sfx: 'sfx_shuffle', label: 'FLIP!', labelColor: '#dd88ff' });
        scene.render();
      }
    }

    if (p.type === 'heal_per_turn') {
      const ratio = p.ratio || 0.05;
      const amount = Math.floor(boss.maxHp * ratio);
      if (boss.hp < boss.maxHp) {
        boss.hp = Math.min(boss.maxHp, boss.hp + amount);
        scene.addBattleLog(`[패시브] ${boss.name}의 초재생! HP +${amount} 회복`);
        this._showEffect(monIdx, { color: 0x44ff44, alpha: 0.25, duration: 500, sfx: 'sfx_heal', label: 'REGEN', labelColor: '#88ff88' });
        scene.renderMonsters();
      }
    }

    if (p.type === 'force_select') {
      const count = p.value || 1;
      const hand = scene.handData;
      let applied = 0;
      for (let i = 0; i < count; i++) {
        const available = hand.map((c, idx) => idx).filter(idx => !scene.forcedSelectedUids?.has(hand[idx].uid));
        if (available.length === 0) break;
        const idx = available[Math.floor(Math.random() * available.length)];
        const card = hand[idx];
        scene.forcedSelectedUids = scene.forcedSelectedUids ?? new Set();
        scene.forcedSelectedUids.add(card.uid);
        scene.selected.add(idx);
        applied++;
      }
      if (applied > 0) {
        scene.addBattleLog(`[패시브] ${boss.name}의 강제 선택!`);
        this._showEffect(monIdx, { color: 0xcc4400, alpha: 0.28, duration: 550, sfx: 'sfx_chop', label: 'FORCED!', labelColor: '#ffaa44' });
        scene.render();
      }
    }

    if (p.type === 'rank_disable') {
      scene.debuffManager.applyRankDisable(boss.name);
      this._showEffect(monIdx, EFFECT.debuff);
    }

    if (p.type === 'suit_disable') {
      scene.debuffManager.applySuitDisable(boss.name);
      this._showEffect(monIdx, EFFECT.debuff);
    }

    if (p.type === 'seal_most_used') {
      scene.debuffManager.applyMostUsedHandSeal(boss.name);
      this._showEffect(monIdx, EFFECT.debuff);
    }

    if (p.type === 'seal_most_and_last') {
      scene.debuffManager.applyMostAndLastHandSeal(boss.name);
      this._showEffect(monIdx, EFFECT.debuff);
    }

    if (p.type === 'hand_reduction') {
      if (boss._handSizeReduced === undefined) boss._handSizeReduced = 0;
      if (boss._handSizeReduced === 0) {
        const val = p.value || 1;
        scene.player.handSize = Math.max(1, scene.player.handSize - val);
        scene.player.handSizeLimit = Math.max(1, scene.player.handSizeLimit - val);
        boss._handSizeReduced = val;
        scene.addBattleLog(`[패시브] ${boss.name}의 계약: 핸드 크기가 축소되었습니다! (-${val})`);
        this._showEffect(monIdx, { ...EFFECT.debuff, label: 'HAND DOWN!', labelColor: '#ff8888' });
        scene.render();
      }
    }
  }

  _plantBombs(count) {
    const { scene } = this;
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const bomb = {
        suit: 'B', rank: '-10', val: 0, baseScore: -10,
        key: 'B-10', uid: `bomb_${now}_${i}`,
        duration: 'temporary', _bomb: true,
      };
      const insertIdx = Math.floor(Math.random() * (scene.deck.deckPile.length + 1));
      scene.deck.deckPile.splice(insertIdx, 0, bomb);
    }
    scene.refreshPlayerStats();
  }

  // ── 보스 턴 패시브 적용 (하위 호환용 래퍼) ───────────────────────────────
  applyPassive(boss) {
    this.activatePassive(boss, 'boss_turn');
  }

  // ── 패시브 해제 (보스 처치 시 등) ──────────────────────────────────────────
  cleanupPassives(boss) {
    const { scene } = this;
    if (boss._handSizeReduced > 0) {
      scene.player.handSize += boss._handSizeReduced;
      scene.player.handSizeLimit += boss._handSizeReduced;
      scene.addBattleLog(`[패시브] ${boss.name} 처치! 핸드 크기가 복구되었습니다.`);
      boss._handSizeReduced = 0;
      scene.render();
    }
  }

  // ── 스킬 초기화 (첫 플레이어 턴에 한 번만 발동) ──────────────────────────
  _initDebuffIfNeeded(boss) {
    if (this._debuffInitialized) return;
    this._debuffInitialized = true;

    if (boss.initSkillId) {
      this._doSkill(boss, 0, boss.initSkillId);
    }
  }

  // ── 보스 턴 실행 ─────────────────────────────────────────────────────────
  doTurn(boss, onDone) {
    const { scene } = this;
    const monIdx = scene.monsters.indexOf(boss);

    // 턴 시작 시점의 페이즈를 미리 결정 (패시브 회복 등으로 인한 중간 변화 방지)
    const phase = this.getCurrentPhase(boss);
    const actions = phase.actions;

    this.activatePassive(boss, 'boss_turn', phase);
    scene.refreshPlayerStats();
    scene.refreshBattleLog();

    // 보스 행동
    actions.forEach((action, i) => {
      scene.time.delayedCall(i * ACTION_GAP + 200, () => {
        this._executeAction(boss, monIdx, action);
        scene.refreshPlayerStats();
        scene.refreshBattleLog();
      });
    });

    // 소환 몬스터 공격 (보스 행동 종료 후 순차 실행)
    const summonedAlive = scene.monsters.filter(m => m.isSummoned && !m.isDead);
    summonedAlive.forEach((mon, si) => {
      const monIdx = scene.monsters.indexOf(mon);
      const delay = actions.length * ACTION_GAP + 200 + si * ACTION_GAP;
      scene.time.delayedCall(delay, () => {
        if (!mon.isDead) {
          this._doAttack(mon, monIdx);
          scene.refreshPlayerStats();
          scene.refreshBattleLog();
        }
      });
    });

    const totalActions = actions.length + summonedAlive.length;
    scene.time.delayedCall(totalActions * ACTION_GAP + 500, () => {
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
    const deadSummoned = this.scene.monsters.find(m => m.isSummoned && m.isDead);
    deadSummoned ? this._doRevive(boss, monIdx, deadSummoned) : this._doAttack(boss, monIdx);
  }

  // ── 소환 몬스터 부활 ────────────────────────────────────────────────────
  _doRevive(boss, monIdx, target) {
    const { scene } = this;

    target.isDead = false;
    target.hp = Math.floor(target.maxHp * 0.5);
    target.state = 'idle';

    const targetIdx = scene.monsters.indexOf(target);
    // [기존 sprite 애니메이션 주석 처리 — MonsterView.revive()로 대체]
    // const sprite    = scene._monsterSprites?.[targetIdx];
    // if (sprite instanceof Phaser.GameObjects.Sprite) {
    //   const idleKey = `${target.id}_idle`;
    //   if (scene.anims.exists(idleKey)) sprite.play(idleKey);
    // }
    scene.monsterViews?.[targetIdx]?.revive();

    this._playAnim(boss, monIdx, 'skill');
    scene.renderMonsters();
    scene.addBattleLog(`${boss.name}의 부활! ${target.name} 재생!`);
    this._showEffect(monIdx, EFFECT.summon);
  }

  // ── 일반 공격 ────────────────────────────────────────────────────────────
  _doAttack(boss, monIdx) {
    const { scene } = this;
    const m = boss;
    const dmg = Math.max(0, m.atk - scene.player.def);
    scene.player.hp = Math.max(0, scene.player.hp - dmg);
    scene.addBattleLog(`${m.name}의 공격! ${dmg} 데미지!`);
    scene.monsterManager._showMonsterAttack(monIdx, dmg);
  }

  // ── 스킬 ────────────────────────────────────────────────────────────────
  _doSkill(boss, monIdx, skillId) {
    const { scene } = this;
    const skill = boss.skills?.[skillId];
    if (!skill) return;

    this._playAnim(boss, monIdx, 'skill');

    // 디버프 계열: DEBUFF_APPLIERS에 등록된 타입은 공통 처리
    const applyDebuff = DEBUFF_APPLIERS[skill.type];
    if (applyDebuff) {
      applyDebuff(scene.debuffManager, boss.name, skill);
      scene.render();
      this._showEffect(monIdx, EFFECT.debuff);
      const { mX, mY } = this._getMonSpritePos(monIdx);
      scene.effects.throwOrb(mX, mY, DEBUFF_ORB.x, DEBUFF_ORB.y, 0xaa44ff);
      return;
    }

    if (skill.type === 'damage') {
      const raw = Math.floor(boss.atk * (skill.damMult ?? 1));
      const dmg = Math.max(0, raw - scene.player.def);
      scene.player.hp = Math.max(0, scene.player.hp - dmg);
      scene.addBattleLog(`${boss.name}의 ${skill.name}! ${dmg} 강력한 데미지!`);
      // 공격 연출 통합 (recoil + orb + hit effect)
      scene.monsterManager._showMonsterAttack(monIdx, dmg);
    } else if (skill.type === 'buff') {
      const val = Math.floor(skill.value * boss.statMulti);
      boss[skill.stat] = (boss[skill.stat] ?? 0) + val;
      scene.addBattleLog(`${boss.name}의 ${skill.name}! ${skill.stat.toUpperCase()} +${val}`);
      this._showEffect(monIdx, EFFECT.buff);

    } else if (skill.type === 'heal_lost_hp') {
      const lost = boss.maxHp - boss.hp;
      const amount = Math.max(1, Math.floor(lost * skill.ratio));
      boss.hp = Math.min(boss.maxHp, boss.hp + amount);
      scene.addBattleLog(`${boss.name}의 ${skill.name}! +${amount} HP`);
      this._showEffect(monIdx, { ...EFFECT.heal, label: `+${amount} HP`, labelColor: '#44ff88' });
      scene.renderMonsters();

    } else if (skill.type === 'force_select') {
      const hand = scene.handData;
      const available = hand.map((c, i) => i).filter(i => !scene.forcedSelectedUids?.has(hand[i].uid));
      if (available.length > 0) {
        const idx = available[Math.floor(Math.random() * available.length)];
        const card = hand[idx];
        scene.forcedSelectedUids = scene.forcedSelectedUids ?? new Set();
        scene.forcedSelectedUids.add(card.uid);
        scene.selected.add(idx);
        scene.addBattleLog(`${boss.name}의 ${skill.name}! ${card.key} 강제 선택!`);
      }
      this._showEffect(monIdx, { color: 0xcc4400, alpha: 0.28, duration: 550, sfx: 'sfx_chop', label: 'FORCED!', labelColor: '#ffaa44' });
      scene.render();

    } else if (skill.type === 'hand_flip') {
      const count = skill.count ?? 3;
      const hand = scene.handData;
      const indices = [...Array(hand.length).keys()];
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const picked = indices.slice(0, Math.min(count, indices.length));
      picked.forEach(idx => { hand[idx].flipped = true; });
      scene.addBattleLog(`${boss.name}의 ${skill.name}! 핸드 ${picked.length}장이 뒤집혔다!`);
      this._showEffect(monIdx, { color: 0x9933cc, alpha: 0.30, duration: 600, sfx: 'sfx_shuffle', label: 'FLIP!', labelColor: '#dd88ff' });
      scene.render();

    } else if (skill.type === 'plant_bombs') {
      const count = skill.count ?? 6;
      this._plantBombs(count);
      scene.addBattleLog(`${boss.name}의 ${skill.name}! 덱에 폭탄 ${count}장 매설!`);
      this._showEffect(monIdx, { color: 0xff4400, alpha: 0.35, duration: 700, sfx: 'sfx_explosion', label: `BOMB ×${count}!`, labelColor: '#ff6600' });

    } else if (skill.type === 'deck_to_dummy') {
      const count = skill.count ?? 5;
      const moved = scene.deck.deckPile.splice(0, count);
      scene.deck.dummyPile.push(...moved);
      scene.addBattleLog(`${boss.name}의 ${skill.name}! 덱에서 ${moved.length}장을 더미로!`);
      this._showEffect(monIdx, { ...EFFECT.debuff, label: `DISCARD ${moved.length}!`, labelColor: '#ff8844' });
      scene.refreshPlayerStats();
    } else if (skill.type === 'steal_gold') {
      const g = scene.player.gold;
      let removed = Math.min(Math.floor(g * 0.1), 10);
      removed = removed === 0 ? 1 : removed;
      scene.player.gold = Math.max(0, g - removed);
      scene.addBattleLog(`${boss.name}의 ${skill.name}! 골드 ${removed}G 소실!`);
      this._showEffect(monIdx, { ...EFFECT.debuff, label: `-${removed}G`, labelColor: '#ffdd00' });
      scene.refreshPlayerStats();
    } else if (skill.type === 'drain_attack') {
      const raw = Math.floor(boss.atk * (skill.damMult ?? 1));
      const dmg = Math.max(0, raw - scene.player.def);
      scene.player.hp = Math.max(0, scene.player.hp - dmg);
      const heal = Math.floor(dmg / 3);
      if (heal > 0) {
        boss.hp = Math.min(boss.maxHp, boss.hp + heal);
        scene.addBattleLog(`${boss.name}의 ${skill.name}! ${dmg} 피해 & ${heal} 흡혈!`);
        this._showEffect(monIdx, { ...EFFECT.heal, label: `+${heal} HP`, labelColor: '#ff2222' });
        scene.renderMonsters();
      } else {
        scene.addBattleLog(`${boss.name}의 ${skill.name}! ${dmg} 피해!`);
      }
      scene.monsterManager._showMonsterAttack(monIdx, dmg);
    }
  }

  // ── 보스 스프라이트 위치 ──────────────────────────────────────────────────
  _getMonSpritePos(monIdx) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;
    const sprite = scene._monsterSprites?.[monIdx];
    const mY = sprite ? sprite.y - 30 : MONSTER_AREA_TOP + MONSTER_AREA_H / 2;
    return { mX, mY };
  }

  // ── 애니메이션 재생 ──────────────────────────────────────────────────────
  _playAnim(boss, monIdx, animType) {
    const { scene } = this;
    const view = scene.monsterViews?.[monIdx];
    if (!view) return;
    if (animType === 'skill') {
      view.playSkill();
    } else {
      view.playAttack();
    }
    // [기존 sprite 방식 주석 처리]
    // const sprite = scene._monsterSprites?.[monIdx];
    // if (!(sprite instanceof Phaser.GameObjects.Sprite)) return;
    // const key     = `${boss.id}_${animType}`;
    // const playKey = scene.anims.exists(key) ? key : `${boss.id}_attack`;
    // const idleKey = `${boss.id}_idle`;
    // if (scene.anims.exists(playKey)) {
    //   sprite.play(playKey);
    //   sprite.once('animationcomplete', () => {
    //     if (scene.anims.exists(idleKey)) sprite.play(idleKey);
    //   });
    // }
  }

  // ── 통합 이펙트 표시 (flash + sfx + 떠오르는 텍스트) ────────────────────────
  // preset: { color, alpha, duration, sfx, label?, labelColor?, labelSize? }
  _showEffect(monIdx, preset) {
    const { scene } = this;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, preset.color, preset.alpha).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: preset.duration, onComplete: () => flash.destroy() });
    if (preset.sfx) scene._sfx(preset.sfx);

    if (preset.label) {
      const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, preset.label, {
        fontFamily: "'PressStart2P',Arial",
        fontSize: preset.labelSize ?? '14px',
        color: preset.labelColor ?? '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(501);
      scene.tweens.add({ targets: txt, y: txt.y - 55, alpha: 0, duration: 650, delay: 80, ease: 'Power2.Out', onComplete: () => txt.destroy() });
    }
  }

  // ── 피격 이펙트 (데미지 라벨 위치가 일반 이펙트와 달라 별도 처리) ───────────────
  _showHitEffect(monIdx, damage, isSkill) {
    const { scene } = this;
    const preset = isSkill ? EFFECT.skill : EFFECT.hit;
    const positions = scene.monsterManager.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, preset.color, preset.alpha).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: preset.duration, onComplete: () => flash.destroy() });
    scene._sfx(preset.sfx);

    const label = damage > 0 ? `-${damage} HP` : 'BLOCKED!';
    const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H + 8, label, TS.damageHit)
      .setOrigin(0.5, 0).setDepth(501);
    if (isSkill) txt.setTint(preset.color);
    scene.tweens.add({ targets: txt, y: 128, alpha: 0, duration: 480, delay: 80, ease: 'Power1.In', onComplete: () => txt.destroy() });
  }
}
