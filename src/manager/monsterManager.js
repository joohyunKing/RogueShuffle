import Phaser from "phaser";
import {
  GW, GH, CW, CH,
  PLAYER_PANEL_W, ITEM_PANEL_W,
  MONSTER_AREA_TOP, MONSTER_AREA_H, MONSTER_IMG_Y,
  HAND_Y, context, HAND_DATA,
} from "../constants.js";
import { TS } from "../textStyles.js";
import { getScoreDetails } from "../service/scoreService.js";

// 플레이어 HP바 방향 orb 목표 좌표 (bossManager.js 의 ATK_ORB 와 동일)
const ATK_ORB = { x: PLAYER_PANEL_W / 2, y: 152 };

export class MonsterManager {
  constructor(scene) {
    this.scene = scene;
  }

  setMonsters(monsters) {
    this.monsters = monsters;
    this.monsters.forEach(mon => { if (!mon.state) mon.state = 'idle'; });
  }

  // ── 몬스터 위치 계산 ───────────────────────────────────────────────────────
  calcMonsterPositions(count) {
    const PW  = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;
    const cx  = PW + FAW / 2;
    if (count <= 1) return [{ x: cx }];
    const margin = 100;
    const gap    = Math.min(130, Math.floor((FAW - margin * 2) / (count - 1)));
    const x0     = Math.round(cx - gap * (count - 1) / 2);
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * gap }));
  }

  // ── 스프라이트시트 유효 프레임 수 감지 ─────────────────────────────────────
  _countValidFrames(texKey) {
    const { scene } = this;
    const tex    = scene.textures.get(texKey);
    const total  = tex.frameTotal - 1;
    const srcImg = tex.getSourceImage();
    const FW = 384, FH = 384, COLS = 3;

    const cvs = document.createElement('canvas');
    cvs.width = FW; cvs.height = FH;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < total; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      ctx.clearRect(0, 0, FW, FH);
      ctx.drawImage(srcImg, col * FW, row * FH, FW, FH, 0, 0, FW, FH);
      const data = ctx.getImageData(0, 0, FW, FH).data;
      const step = Math.floor(FW / 10);
      let hasPixel = false;
      outer: for (let py = step >> 1; py < FH; py += step) {
        for (let px = step >> 1; px < FW; px += step) {
          if (data[(py * FW + px) * 4 + 3] > 10) { hasPixel = true; break outer; }
        }
      }
      if (!hasPixel) return i;
    }
    return total;
  }

  // ── 디버프로 disabled 된 카드 판별 ───────────────────────────────────────
  _isCardDisabled(card) {
    const dm = this.scene.debuffManager;
    return dm.disabledCardUids.has(card.uid)
      || dm.disabledRanks.has(card.rank)
      || dm.disabledSuits.has(card.suit);
  }

  // ── 몬스터 애니메이션 재생 후 idle 복귀 ──────────────────────────────────
  // animType 키가 없으면 fallbackType 으로 시도
  _playMonAnim(monIdx, animType, fallbackType = 'attack') {
    const { scene } = this;
    const sprite = scene._monsterSprites?.[monIdx];
    if (!(sprite instanceof Phaser.GameObjects.Sprite)) return;
    const mon = scene.monsters[monIdx];
    if (!mon) return;
    const key     = `${mon.id}_${animType}`;
    const playKey = scene.anims.exists(key) ? key
      : (scene.anims.exists(`${mon.id}_${fallbackType}`) ? `${mon.id}_${fallbackType}` : null);
    if (!playKey) return;
    sprite.play(playKey);
    sprite.once('animationcomplete', () => {
      const idleKey = `${mon.id}_idle`;
      if (scene.anims.exists(idleKey)) sprite.play(idleKey);
    });
  }

  // ── 피격 이펙트 (flash + sfx + 데미지 라벨) ──────────────────────────────
  // mX: 라벨 X 위치, opts: { flashColor, flashAlpha, sfx, tint? }
  _showHitEffect(mX, damage, {
    flashColor = 0xcc0000, flashAlpha = 0.22,
    sfx = 'sfx_chop', tint = null,
  } = {}) {
    const { scene } = this;
    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, flashColor, flashAlpha).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 480, onComplete: () => flash.destroy() });
    scene._sfx(sfx);

    const label = damage > 0 ? `-${damage} HP` : 'BLOCKED!';
    const style = (damage > 0 || tint) ? TS.damageHit : TS.damageBlocked;
    const txt   = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H + 8, label, style)
      .setOrigin(0.5, 0).setDepth(501);
    if (tint) txt.setTint(tint);
    scene.tweens.add({ targets: txt, y: 128, alpha: 0, duration: 480, delay: 80, ease: 'Power1.In', onComplete: () => txt.destroy() });
  }

  // ── 처치 공통 처리 (XP/골드 획득, 로그, 레벨업) ───────────────────────────
  // monIdx가 null 이면 _playDie 생략 (AOE 처치 시 render() 가 대신 처리)
  _onKill(mon, monIdx = null, label = null) {
    const { scene } = this;
    mon.isDead = true;
    if (monIdx !== null) this._playDie(monIdx, mon);
    const newLevels = scene.player.addXp(mon.xp);
    scene.player.gold += mon.gold;
    scene.addBattleLog(label ?? `${mon.name} 처치! +${mon.xp}XP +${mon.gold}G`);
    if (newLevels.length > 0) {
      scene.addBattleLog(`LEVEL UP! Lv${scene.player.level}`);
      scene._suitLevelUpCount += newLevels.length;
    }
  }

  // ── 몬스터 공격 ──────────────────────────────────────────────────────────
  attackMonster(monIdx) {
    const { scene } = this;
    const mon = scene.monsters[monIdx];
    if (!mon || mon.isDead || scene.isDealing) return;

    scene._refreshContext();

    // 점수 계산: disabled 카드 제외 (점수/슈트 효과 기여 안 함, dummy로는 버려짐)
    const selectedCards = [...scene.selected].map(i => scene.handData[i])
      .filter(c => !this._isCardDisabled(c));
    context.handRemainingCount = scene.handData.length - selectedCards.length;
    const details = getScoreDetails(selectedCards, context);
    if (details.totalScore <= 0) return;

    if (scene.attackCount >= scene.player.attacksPerTurn) {
      scene.addBattleLog(`이번 턴 공격 횟수 초과! (${scene.player.attacksPerTurn}회)`);
      return;
    }

    const { totalScore: score, handName, aoe, rank: handRank } = details;

    // 봉인된 족보 차단
    if (handRank != null && scene.debuffManager.disabledHandRanks.has(handRank)) {
      scene.addBattleLog(`[${HAND_DATA[handRank]?.key ?? handRank}] 봉인된 족보입니다!`);
      scene.refreshBattleLog();
      return;
    }

    // 족보 사용 기록
    if (handRank != null) {
      scene.player.handUseCounts[handRank] = (scene.player.handUseCounts[handRank] ?? 0) + 1;
      scene.player.lastHandRank = handRank;
    }

    // 카드 위치 · 슈트 카운트 캡처 (제거 전) — 슈트 효과도 활성 카드만
    const selectedIndices = [...scene.selected].sort((a, b) => a - b);
    const handPositions   = scene.calcHandPositions(scene.handData.length);
    const suitCounts      = { S: 0, H: 0, D: 0, C: 0 };
    selectedIndices.forEach(i => {
      const c = scene.handData[i];
      if (!this._isCardDisabled(c)) suitCounts[c.suit]++;
    });

    const cardFlyInfo = selectedIndices.map(i => {
      const card = scene.handData[i];
      return {
        fromX: handPositions[i].x,
        fromY: HAND_Y - 22,
        key: card.key,
        obj: scene.handCardObjs?.[i] ?? null,
        scoringDetail: details.cardDetails.find(cd => cd.card.uid === card.uid) ?? null,
      };
    });

    scene.attackCount++;
    scene.isDealing = true;

    // 씰 효과 (골드/아이템) 적용
    scene._applySealEffects?.(selectedCards);

    const removeCards = () => {
      scene.selected.clear();
      [...selectedIndices].sort((a, b) => b - a)
        .forEach(i => { scene.dummyData.push(...scene.handData.splice(i, 1)); });
      scene.render();
    };

    const positions = this.calcMonsterPositions(scene.monsters.length);
    const suitEff   = (s) => Math.floor(
      scene.player.attrs[s] * scene.player.adaptability[s] * suitCounts[s]
    );

    scene.playAttackAnimation(details, cardFlyInfo, removeCards, () => {
      if (aoe) {
        this._resolveAoe(score, handName, suitCounts, suitEff, positions);
      } else {
        this._resolveSingle(mon, monIdx, score, handName, suitCounts, suitEff, positions);
      }
    });
  }

  // ── 광역 공격 처리 ────────────────────────────────────────────────────────
  _resolveAoe(score, handName, suitCounts, suitEff, positions) {
    const { scene } = this;
    const aliveMonsters = scene.monsters.filter(m => !m.isDead);
    const aliveSprites  = scene._monsterSprites?.filter((_, i) => !scene.monsters[i]?.isDead) ?? [];

    // 슈트 적응 효과 (전체 대상)
    if (suitCounts.S > 0) {
      const eff = suitEff('S');
      if (eff > 0) { aliveMonsters.forEach(m => { m.def -= eff; }); scene.addBattleLog(`♠ 적응: 전체 DEF -${eff}`); }
    }
    if (suitCounts.C > 0) {
      const eff = suitEff('C');
      if (eff > 0) {
        aliveMonsters.forEach(m => {
          const reduced = Math.min(eff, m.atk);
          m.atk = Math.max(0, m.atk - eff);
          if (reduced > 0) scene.addBattleLog(`♣ 적응: ${m.name} ATK -${reduced}`);
        });
      }
    }
    if (suitCounts.H > 0) {
      const eff = suitEff('H');
      scene.player.hp = Math.min(scene.player.maxHp, scene.player.hp + eff);
      if (eff > 0) scene.addBattleLog(`♥ 적응: HP +${eff}`);
    }
    if (suitCounts.D > 0) {
      const eff = suitEff('D');
      scene.player.def += eff;
      if (eff > 0) scene.addBattleLog(`♦ 적응: DEF +${eff}`);
    }

    scene.player.score += score;
    scene.addBattleLog(`${handName}! 전체에 ${score}점 광역 공격!`);
    scene._sfx("sfx_knifeSlice");

    const aoeX = positions.length > 0
      ? positions.reduce((s, p) => s + p.x, 0) / positions.length
      : GW / 2;
    scene.effects.hitExplosion(aoeX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, aliveSprites);

    aliveMonsters.forEach(m => {
      const dmg = Math.floor(Math.max(0, score - m.def));
      m.hp = Math.max(0, m.hp - dmg);
      if (scene.isBoss && m === scene.monsters[0]) m._damageTaken = (m._damageTaken ?? 0) + dmg;
      scene.addBattleLog(`${m.name}에게 ${dmg} 데미지!`);
      if (m.hp <= 0) this._onKill(m); // AOE: _playDie 생략, render() 가 처리
    });

    scene.isDealing = false;
    scene.render();
    scene._checkLevelUpThenProceed();
  }

  // ── 단일 타겟 공격 처리 ──────────────────────────────────────────────────
  _resolveSingle(mon, monIdx, score, handName, suitCounts, suitEff, positions) {
    const { scene } = this;

    // 슈트 적응 효과 (데미지 전: ♠DEF감소, ♣ATK감소)
    if (suitCounts.S > 0) {
      const eff = suitEff('S');
      mon.def -= eff;
      if (eff > 0) scene.addBattleLog(`♠ 적응: ${mon.name} DEF -${eff}`);
    }
    if (suitCounts.C > 0) {
      const eff    = suitEff('C');
      const reduced = Math.min(eff, mon.atk);
      mon.atk = Math.max(0, mon.atk - eff);
      if (reduced > 0) scene.addBattleLog(`♣ 적응: ${mon.name} ATK -${reduced}`);
    }

    const damage   = Math.floor(Math.max(0, score - mon.def));
    const prevHp   = mon.hp;
    mon.hp         = Math.max(0, mon.hp - damage);
    if (scene.isBoss) mon._damageTaken = (mon._damageTaken ?? 0) + damage;
    const overkill = Math.max(0, damage - prevHp);
    const bullseye = mon.hp === 0 && overkill === 0 && damage > 0;
    scene.player.score += score;
    this._refreshHP(monIdx, mon);

    // 슈트 적응 효과 (데미지 후: ♥HP회복, ♦DEF증가)
    if (suitCounts.H > 0) {
      const eff = suitEff('H');
      scene.player.hp = Math.min(scene.player.maxHp, scene.player.hp + eff);
      if (eff > 0) scene.addBattleLog(`♥ 적응: HP +${eff}`);
    }
    if (suitCounts.D > 0) {
      const eff = suitEff('D');
      scene.player.def += eff;
      if (eff > 0) scene.addBattleLog(`♦ 적응: DEF +${eff}`);
    }

    scene.addBattleLog(`${mon.name}에게 ${handName}로 ${Math.max(0, damage)} 데미지!`);
    scene._sfx("sfx_knifeSlice");

    const monSprite = scene._monsterSprites?.[monIdx];
    scene.effects.hitLightning(
      monSprite?.x ?? positions[monIdx].x,
      monSprite?.y ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2),
      monSprite ?? null
    );

    const damagedKey = `${mon.id}_damaged`;
    if (monSprite instanceof Phaser.GameObjects.Sprite && scene.anims.exists(damagedKey)) {
      monSprite.play(damagedKey);
      monSprite.once('animationcomplete', () => {
        scene.isDealing = false;
        this._afterAttack(mon, monIdx, overkill, bullseye);
      });
    } else {
      scene.isDealing = false;
      this._afterAttack(mon, monIdx, overkill, bullseye);
    }
  }

  // ── 공격 후 처리 ──────────────────────────────────────────────────────────
  _afterAttack(mon, monIdx, overkill = 0, bullseye = false) {
    const { scene } = this;
    if (mon.hp <= 0) {
      this._onKill(mon, monIdx);
      if (overkill > 0) {
        scene.isDealing = true;
        this._applyOverkill(monIdx, overkill, () => {
          scene.isDealing = false;
          scene.render();
          scene._checkLevelUpThenProceed();
        });
      } else if (bullseye) {
        scene.isDealing = true;
        scene.addBattleLog(`BULLSEYE! ${mon.name} 최대 체력(${mon.maxHp})으로 광역!`);
        this._applyBullseye(monIdx, mon.maxHp, () => {
          scene.isDealing = false;
          scene.render();
          scene._checkLevelUpThenProceed();
        });
      } else {
        scene.render();
        scene._checkLevelUpThenProceed();
      }
    } else {
      scene.render();
    }
  }

  // ── 불스아이 광역 ─────────────────────────────────────────────────────────
  _applyBullseye(fromIdx, dmg, onDone) {
    const { scene } = this;
    if (dmg <= 0) { onDone?.(); return; }

    const aliveTargets = scene.monsters
      .map((m, i) => ({ m, i }))
      .filter(({ m, i }) => !m.isDead && i !== fromIdx);
    if (aliveTargets.length === 0) { onDone?.(); return; }

    const positions   = this.calcMonsterPositions(scene.monsters.length);
    const aoeX        = positions[fromIdx].x;
    const aliveSprites = aliveTargets.map(({ i }) => scene._monsterSprites?.[i]).filter(Boolean);
    scene.effects.hitExplosion(aoeX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, aliveSprites);

    aliveTargets.forEach(({ m, i }) => {
      const actualDmg = Math.max(0, dmg - m.def);
      m.hp = Math.max(0, m.hp - actualDmg);
      scene.addBattleLog(`BULLSEYE 연쇄! ${m.name}에게 ${actualDmg} 데미지!`);
      if (m.hp <= 0 && !m.isDead) {
        this._onKill(m, i);
      } else {
        this._refreshHP(i, m);
      }
    });

    onDone?.();
  }

  // ── 오버킬 연쇄 ──────────────────────────────────────────────────────────
  _applyOverkill(fromIdx, dmg, onDone) {
    const { scene } = this;
    if (dmg <= 0) { onDone?.(); return; }

    // fromIdx 이후 → 이전 순으로 다음 생존 몬스터 탐색
    let idx = -1;
    for (let i = fromIdx + 1; i < scene.monsters.length; i++) {
      if (!scene.monsters[i].isDead) { idx = i; break; }
    }
    if (idx === -1) {
      for (let i = 0; i < fromIdx; i++) {
        if (!scene.monsters[i].isDead) { idx = i; break; }
      }
    }
    if (idx === -1) { onDone?.(); return; }

    const positions  = this.calcMonsterPositions(scene.monsters.length);
    const fromSprite = scene._monsterSprites?.[fromIdx];
    const toSprite   = scene._monsterSprites?.[idx];
    scene.effects.hitChainLightning(
      fromSprite?.x ?? positions[fromIdx].x,
      fromSprite?.y ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2),
      toSprite?.x   ?? positions[idx].x,
      toSprite?.y   ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2),
      toSprite ?? null
    );
    scene._sfx("sfx_knifeSlice");

    scene.time.delayedCall(120, () => {
      const target    = scene.monsters[idx];
      const actualDmg = Math.max(0, dmg - target.def);
      const prevHp    = target.hp;
      target.hp       = Math.max(0, target.hp - actualDmg);
      const chain     = Math.max(0, actualDmg - prevHp);
      this._refreshHP(idx, target);
      scene.addBattleLog(`오버킬! ${target.name}에게 ${actualDmg} 연쇄!`);

      if (target.hp <= 0 && !target.isDead) {
        this._onKill(target, idx, `${target.name} 연쇄 처치! +${target.xp}XP`);
        if (chain > 0) {
          scene.time.delayedCall(120, () => this._applyOverkill(idx, chain, onDone));
        } else {
          onDone?.();
        }
      } else {
        const damagedKey = `${target.id}_damaged`;
        if (toSprite instanceof Phaser.GameObjects.Sprite && scene.anims.exists(damagedKey)) {
          toSprite.play(damagedKey);
          toSprite.once('animationcomplete', () => onDone?.());
        } else {
          onDone?.();
        }
      }
    });
  }

  // ── HP바 즉시 갱신 (애니메이션 불간섭) ──────────────────────────────────
  _refreshHP(monIdx, mon) {
    this.scene.monsterViews?.[monIdx]?.updateStats(mon);
  }

  // ── die 애니메이션 즉시 재생 ─────────────────────────────────────────────
  _playDie(monIdx, mon) {
    const view = this.scene.monsterViews?.[monIdx];
    if (!view) return;
    view.updateStats(mon);
    const dieKey = `${mon.id}_die`;
    if (this.scene.anims.exists(dieKey)) view.sprite.play(dieKey);
  }

  // ── 몬스터 행동 결정 (일반 공격 or 스킬) ─────────────────────────────────
  doMonsterAction(monIdx, m) {
    const { scene } = this;
    const useSkill = m.skill && Math.random() * 100 < (m.skill.probability ?? 0);
    if (useSkill) {
      this._useMonsterSkill(monIdx, m);
    } else {
      const dmg = Math.max(0, m.atk - scene.player.def);
      scene.player.hp = Math.max(0, scene.player.hp - dmg);
      scene.addBattleLog(`${m.name}의 공격! ${dmg} 데미지!`);
      this._showMonsterAttack(monIdx, dmg);
    }
  }

  // ── 몬스터 스킬 사용 ─────────────────────────────────────────────────────
  _useMonsterSkill(monIdx, m) {
    const { scene } = this;
    const skill = m.skill;
    const positions = this.calcMonsterPositions(scene.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    this._playMonAnim(monIdx, 'skill');

    if (skill.type === 'damage') {
      const raw = skill.value ?? Math.floor(m.atk * (skill.damMult ?? 1));
      const dmg = Math.max(0, raw - scene.player.def);
      scene.player.hp = Math.max(0, scene.player.hp - dmg);
      scene.addBattleLog(`${m.name}의 ${skill.name}! ${dmg} 데미지!`);
      this._showHitEffect(mX, dmg, { flashColor: 0x880088, flashAlpha: 0.25, sfx: 'sfx_knifeSlice', tint: 0xee44ff });

    } else if (skill.type === 'debuff') {
      scene.debuffManager.applyDebuff(skill.debuffId ?? skill.value, m.name);
      scene.render();
      const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x440044, 0.20).setDepth(500);
      scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
      scene._sfx("sfx_chop");
    }
  }

  // ── 몬스터 일반 공격 연출 ────────────────────────────────────────────────
  _showMonsterAttack(monIdx, damage) {
    const { scene } = this;
    const positions = this.calcMonsterPositions(scene.monsters.length);
    const mX        = positions[monIdx]?.x ?? GW / 2;
    const monSprite = scene._monsterSprites?.[monIdx];
    const fromY     = monSprite instanceof Phaser.GameObjects.Sprite
      ? monSprite.y - 30
      : MONSTER_AREA_TOP + MONSTER_AREA_H / 2;

    this._playMonAnim(monIdx, 'attack');
    scene.effects.throwOrb(mX, fromY, ATK_ORB.x, ATK_ORB.y, 0xff4444);
    this._showHitEffect(mX, damage);
  }
}
