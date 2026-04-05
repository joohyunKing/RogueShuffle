import Phaser from "phaser";
import {
  GW, GH, CW, CH,
  PLAYER_PANEL_W, ITEM_PANEL_W,
  MONSTER_AREA_TOP, MONSTER_AREA_H, MONSTER_IMG_Y,
  HAND_Y, context,
} from "../constants.js";
import { TS } from "../textStyles.js";
import { getScoreDetails } from "../service/scoreService.js";

export class MonsterManager {
  constructor(scene) {
    this.scene = scene;
  }
  
  setMonsters(monsters) {
    this.monsters = monsters;
  
    // 상태 초기화 (없으면)
    this.monsters.forEach(mon => {
      if (!mon.state) mon.state = 'idle';
    });
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

  // ── 몬스터 공격 ──────────────────────────────────────────────────────────
  attackMonster(monIdx) {
    const { scene } = this;
    const mon = scene.monsters[monIdx];
    if (!mon || mon.isDead || scene.isDealing) return;

    scene._refreshContext();

    // 점수 내역 계산 (애니메이션 + 데미지 모두 사용)
    const selectedCards = [...scene.selected].map(i => scene.handData[i]);
    const details = getScoreDetails(selectedCards, context);
    if (details.totalScore <= 0) return;

    if (scene.attackCount >= scene.player.attacksPerTurn) {
      scene.addBattleLog(`이번 턴 공격 횟수 초과! (${scene.player.attacksPerTurn}회)`);
      return;
    }

    const score    = details.totalScore;
    const handName = details.handName;
    const aoe      = details.aoe;

    // 카드 위치 · 슈트 카운트 캡처 (제거 전)
    const selectedIndices = [...scene.selected].sort((a, b) => a - b);
    const handPositions   = scene.calcHandPositions(scene.handData.length);
    const suitCounts      = { S: 0, H: 0, D: 0, C: 0 };
    selectedIndices.forEach(i => { suitCounts[scene.handData[i].suit]++; });

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

    // 카드 제거 콜백 — 펄스 애니메이션 완료 후 dummy로 이동
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
        // ── 광역 공격 ────────────────────────────────────────────────────
        const aliveMonsters = scene.monsters.filter(m => !m.isDead);
        const aliveSprites  = scene._monsterSprites?.filter((_, i) => !scene.monsters[i]?.isDead) ?? [];

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
          scene.addBattleLog(`${m.name}에게 ${dmg} 데미지!`);
          if (m.hp <= 0) {
            m.isDead = true;
            const newLevels = scene.player.addXp(m.xp);
            scene.player.gold += m.gold;
            scene.addBattleLog(`${m.name} 처치! +${m.xp}XP +${m.gold}G`);
            if (newLevels.length > 0) {
              scene.addBattleLog(`LEVEL UP! Lv${scene.player.level}`);
              scene._suitLevelUpCount += newLevels.length;
            }
          }
        });

        scene.isDealing = false;
        scene.render();
        scene._checkLevelUpThenProceed();

      } else {
        // ── 단일 타겟 공격 ────────────────────────────────────────────────
        if (suitCounts.S > 0) {
          const eff = suitEff('S');
          mon.def -= eff;
          if (eff > 0) scene.addBattleLog(`♠ 적응: ${mon.name} DEF -${eff}`);
        }
        if (suitCounts.C > 0) {
          const eff = suitEff('C');
          const reduced = Math.min(eff, mon.atk);
          mon.atk = Math.max(0, mon.atk - eff);
          if (reduced > 0) scene.addBattleLog(`♣ 적응: ${mon.name} ATK -${reduced}`);
        }

        const damage   = Math.floor(Math.max(0, score - mon.def));
        const prevHp   = mon.hp;
        mon.hp         = Math.max(0, mon.hp - damage);
        const overkill = Math.max(0, damage - prevHp);
        const bullseye = mon.hp === 0 && overkill === 0 && damage > 0;
        scene.player.score += score;
        this._refreshHP(monIdx, mon);

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

        const monSprite  = scene._monsterSprites?.[monIdx];
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
    });
  }

  // ── 공격 후 처리 ──────────────────────────────────────────────────────────
  _afterAttack(mon, monIdx, overkill = 0, bullseye = false) {
    const { scene } = this;
    if (mon.hp <= 0) {
      mon.isDead = true;
      this._playDie(monIdx, mon);
      const newLevels = scene.player.addXp(mon.xp);
      scene.player.gold += mon.gold;
      scene.addBattleLog(`${mon.name} 처치! +${mon.xp}XP +${mon.gold}G`);
      if (newLevels.length > 0) {
        scene.addBattleLog(`LEVEL UP! Lv${scene.player.level}`);
        scene._suitLevelUpCount += newLevels.length;
      }
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

  // ── 불스아이 BullsEye 광역 ──────────────────────────────────────────────────────────
  _applyBullseye(fromIdx, dmg, onDone) {
    const { scene } = this;
    if (dmg <= 0) { onDone?.(); return; }

    const aliveTargets = scene.monsters
      .map((m, i) => ({ m, i }))
      .filter(({ m, i }) => !m.isDead && i !== fromIdx);

    if (aliveTargets.length === 0) { onDone?.(); return; }

    const positions  = this.calcMonsterPositions(scene.monsters.length);
    const aoeX       = positions[fromIdx].x;
    const aoeY       = MONSTER_AREA_TOP + MONSTER_AREA_H / 2;
    const aliveSprites = aliveTargets
      .map(({ i }) => scene._monsterSprites?.[i])
      .filter(Boolean);

    scene.effects.hitExplosion(aoeX, aoeY, aliveSprites);

    aliveTargets.forEach(({ m, i }) => {
      const actualDmg = Math.max(0, dmg - m.def);
      m.hp = Math.max(0, m.hp - actualDmg);
      scene.addBattleLog(`BULLSEYE 연쇄! ${m.name}에게 ${actualDmg} 데미지!`);
      if (m.hp <= 0 && !m.isDead) {
        m.isDead = true;
        this._playDie(i, m);
        const newLevels = scene.player.addXp(m.xp);
        scene.player.gold += m.gold;
        scene.addBattleLog(`${m.name} 처치! +${m.xp}XP +${m.gold}G`);
        if (newLevels.length > 0) {
          scene.addBattleLog(`LEVEL UP! Lv${scene.player.level}`);
          scene._suitLevelUpCount += newLevels.length;
        }
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
    const fromX      = fromSprite?.x ?? positions[fromIdx].x;
    const fromY      = fromSprite?.y ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2);
    const toX        = toSprite?.x   ?? positions[idx].x;
    const toY        = toSprite?.y   ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2);

    scene.effects.hitChainLightning(fromX, fromY, toX, toY, toSprite ?? null);
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
        target.isDead = true;
        this._playDie(idx, target);
        const newLevels = scene.player.addXp(target.xp);
        scene.player.gold += target.gold;
        scene.addBattleLog(`${target.name} 연쇄 처치! +${target.xp}XP`);
        if (newLevels.length > 0) {
          scene.addBattleLog(`LEVEL UP! Lv${scene.player.level}`);
          scene._suitLevelUpCount += newLevels.length;
        }
        if (chain > 0) {
          scene.time.delayedCall(120, () => this._applyOverkill(idx, chain, onDone));
        } else {
          onDone?.();
        }
      } else {
        // 생존 — damaged 애니메이션 기다린 후 종료
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
    if (this.scene.anims.exists(dieKey)) {
      view.sprite.play(dieKey);
    }
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
    const skill       = m.skill;
    const monSprite   = scene._monsterSprites?.[monIdx];
    const skillTexKey = `${m.id}_skill`;
    const skillAnimKey = `${m.id}_skill`;
    const idleKey     = `${m.id}_idle`;

    if (monSprite instanceof Phaser.GameObjects.Sprite) {
      const playKey = scene.anims.exists(skillAnimKey) ? skillAnimKey
                    : `${m.id}_attack`;
      if (scene.anims.exists(playKey)) {
        monSprite.play(playKey);
        monSprite.once('animationcomplete', () => {
          if (scene.anims.exists(idleKey)) monSprite.play(idleKey);
        });
      }
    }

    if (skill.type === 'damage') {
      const raw = skill.value ?? Math.floor(m.atk * (skill.damMult ?? 1));
      const dmg = Math.max(0, raw - scene.player.def);
      scene.player.hp = Math.max(0, scene.player.hp - dmg);
      scene.addBattleLog(`${m.name}의 ${skill.name}! ${dmg} 데미지!`);

      const positions = this.calcMonsterPositions(scene.monsters.length);
      const mX = positions[monIdx]?.x ?? GW / 2;
      const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x880088, 0.25).setDepth(500);
      scene.tweens.add({ targets: flash, alpha: 0, duration: 480, onComplete: () => flash.destroy() });
      scene._sfx("sfx_knifeSlice");
      const label = dmg > 0 ? `-${dmg} HP` : 'BLOCKED!';
      const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H + 8, label, TS.damageHit)
        .setOrigin(0.5, 0).setDepth(501).setTint(0xee44ff);
      scene.tweens.add({
        targets: txt, y: 128, alpha: 0, duration: 480, delay: 80, ease: 'Power1.In',
        onComplete: () => txt.destroy(),
      });

    } else if (skill.type === 'debuff') {
      const debuffId = skill.debuffId ?? skill.value;
      scene.debuffManager.applyDebuff(debuffId, m.name);
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

    const monSprite  = scene._monsterSprites?.[monIdx];
    const mon        = scene.monsters[monIdx];
    const attackKey  = `${mon?.id}_attack`;
    const idleKey    = `${mon?.id}_idle`;
    if (monSprite instanceof Phaser.GameObjects.Sprite && scene.anims.exists(attackKey)) {
      monSprite.play(attackKey);
      monSprite.once('animationcomplete', () => {
        if (scene.anims.exists(idleKey)) monSprite.play(idleKey);
      });
    }

    // Orb: 몬스터 → 플레이어 HP 바
    const fromY = monSprite instanceof Phaser.GameObjects.Sprite ? monSprite.y - 30 : MONSTER_AREA_TOP + MONSTER_AREA_H / 2;
    scene.effects.throwOrb(mX, fromY, PLAYER_PANEL_W / 2, 152, 0xff4444);

    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0xcc0000, 0.22).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 480, onComplete: () => flash.destroy() });
    scene._sfx("sfx_chop");

    const label    = damage > 0 ? `-${damage} HP` : "BLOCKED!";
    const txtStyle = damage > 0 ? TS.damageHit : TS.damageBlocked;
    const txt = scene.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H + 8, label, txtStyle)
      .setOrigin(0.5, 0).setDepth(501);
    scene.tweens.add({
      targets: txt, y: 128, alpha: 0, duration: 480, delay: 80, ease: "Power1.In",
      onComplete: () => txt.destroy(),
    });
  }
}
