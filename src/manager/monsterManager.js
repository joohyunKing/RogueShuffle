import Phaser from "phaser";
import {
  GW, GH, CW, CH,
  PLAYER_PANEL_W, ITEM_PANEL_W,
  MONSTER_AREA_TOP, MONSTER_AREA_H, MONSTER_IMG_Y,
  HAND_Y, context, HAND_DATA,
} from "../constants.js";
import { TS } from "../textStyles.js";
import { getScoreDetails } from "../service/scoreService.js";
import { getAllItems } from '../manager/itemManager.js';
import { getLang, getUiText, getMonsterName, getMonsterSkillName, getHandName, getItemName } from '../service/langService.js';

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
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;
    const cx = PW + FAW / 2;
    if (count <= 1) return [{ x: cx }];

    const isElite = this.scene?.battleType === 'elite';
    const margin = isElite ? 80 : 100;
    const natural = Math.floor((FAW - margin * 2) / (count - 1));
    const gap = isElite
      ? Math.min(210, natural) //Math.max(Math.round(156 * 1.4) + 20, Math.min(natural, Math.round(156 * 1.4 * 1.7)))
      : Math.min(130, natural);
    const x0 = Math.round(cx - gap * (count - 1) / 2);
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * gap }));
  }

  // ── 스프라이트시트 유효 프레임 수 감지 ─────────────────────────────────────
  _countValidFrames(texKey) {
    const { scene } = this;
    const tex = scene.textures.get(texKey);
    const total = tex.frameTotal - 1;
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

  // ── 디버프로 disabled 된 카드 판별 (DebuffManager에 위임) ──────────────────
  _isCardDisabled(card) {
    return this.scene.debuffManager.isCardDisabled(card);
  }

  // ── 몬스터 애니메이션 재생 ────────────────────────────────────────────────
  // [기존 sprite 방식 주석 처리 — MonsterView tween으로 대체]
  _playMonAnim(monIdx, animType, fallbackType = 'attack') {
    const { scene } = this;
    const view = scene.monsterViews?.[monIdx];
    if (!view) return;
    if (animType === 'skill') {
      view.playSkill();
    } else {
      view.playAttack();
    }
    // [기존 코드 주석 처리]
    // const sprite = scene._monsterSprites?.[monIdx];
    // if (!(sprite instanceof Phaser.GameObjects.Sprite)) return;
    // const mon = scene.monsters[monIdx];
    // if (!mon) return;
    // const key     = `${mon.id}_${animType}`;
    // const playKey = scene.anims.exists(key) ? key
    //   : (scene.anims.exists(`${mon.id}_${fallbackType}`) ? `${mon.id}_${fallbackType}` : null);
    // if (!playKey) return;
    // sprite.play(playKey);
    // sprite.once('animationcomplete', () => {
    //   const idleKey = `${mon.id}_idle`;
    //   if (scene.anims.exists(idleKey)) sprite.play(idleKey);
    // });
  }

  // ── 플레이어 피격 이펙트 (카메라 shake + 패널 flash + HP 위치 데미지 라벨) ──
  // opts: { sfx, tint, shakeIntensity, flashColor }
  _showPlayerHitEffect(damage, {
    sfx = 'sfx_chop', tint = null,
    shakeIntensity = 0.012,
    flashColor = 0xff2200,
  } = {}) {
    const { scene } = this;

    // 카메라 흔들기
    scene.cameras.main.shake(200, shakeIntensity);

    // 플레이어 패널(좌측) 집중 플래시
    const flash = scene.add.rectangle(PLAYER_PANEL_W / 2, GH / 2, PLAYER_PANEL_W + 20, GH, flashColor, 0.48)
      .setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 380, ease: 'Power2.In', onComplete: () => flash.destroy() });

    scene._sfx(sfx);

    // 데미지 라벨: 플레이어 HP바 위치에서 위로 올라옴
    const label = damage > 0 ? `-${damage} HP` : 'BLOCKED!';
    const style = damage > 0 ? TS.damageHit : TS.damageBlocked;
    const txt = scene.add.text(ATK_ORB.x, ATK_ORB.y, label, style)
      .setOrigin(0.5, 1).setDepth(501);
    if (tint) txt.setTint(tint);
    scene.tweens.add({
      targets: txt,
      y: ATK_ORB.y - 55,
      alpha: 0,
      duration: 550,
      delay: 50,
      ease: 'Power1.Out',
      onComplete: () => txt.destroy(),
    });
  }

  // ── 처치 공통 처리 (XP/골드 획득, 로그, 레벨업) ───────────────────────────
  // monIdx가 null 이면 _playDie 생략 (AOE 처치 시 render() 가 대신 처리)
  _onKill(mon, monIdx = null, label = null) {
    const { scene } = this;
    mon.isDead = true;
    if (monIdx !== null) this._playDie(monIdx, mon);

    // 보스 패시브 해제 처리 (핸드 크기 축소 등)
    if (mon._handSizeReduced > 0 && scene.bossManager) {
      scene.bossManager.cleanupPassives(mon);
    }
    const lang = getLang(scene);
    const mName = getMonsterName(lang, mon.id);
    const newLevels = scene.player.addXp(mon.xp);
    scene.player.gold += mon.gold;
    scene.addBattleLog(label ?? getUiText(lang, 'battle.log_kill', { name: mName, xp: mon.xp, gold: mon.gold }));
    if (newLevels.length > 0) {
      scene.addBattleLog(getUiText(lang, 'battle.log_level_up', { lv: scene.player.level }));
      scene._suitLevelUpCount += newLevels.length;
    }

    // 소환수 처치 시 보스 패시브(소환수 비례 방어력 등) 실시간 갱신
    if (mon.isSummoned && scene.isBoss && scene.bossManager) {
      scene.bossManager.refreshStatePassives(scene.monsters[0]);
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
    if (details.handRank == null || (details.cards?.length ?? 0) === 0) return;

    const isFirstAttack = (scene.attackCount === 0);
    const lang = getLang(scene);
    if (scene.attackCount >= scene.player.attacksPerTurn) {
      scene.addBattleLog(getUiText(lang, 'battle.log_attack_limit', { n: scene.player.attacksPerTurn }));
      return;
    }

    const { totalScore: score, handName, aoe, handRank } = details;

    // 봉인된 족보 차단
    if (handRank != null && scene.debuffManager.disabledHandRanks.has(handRank)) {
      const hName = getHandName(lang, handRank);
      scene.addBattleLog(getUiText(lang, 'battle.log_hand_sealed', { hand: hName }));
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
    const handPositions = scene.calcHandPositions(scene.handData.length);
    const suitCounts = { S: 0, H: 0, D: 0, C: 0 };
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
        isFlipped: card.flipped === true,
        obj: scene.handCardObjs?.[i] ?? null,
        scoringDetail: details.cardDetails.find(cd => cd.card.uid === card.uid) ?? null,
      };
    });

    scene.attackCount++;
    scene.isDealing = true;

    // 씰 효과 (골드/아이템) 적용 — 족보 구성 카드만
    scene._applySealEffects?.(details.cards);

    const removeCards = () => {
      scene.selected.clear();
      const hasSnake = scene.player.relics.includes('snake');
      const shouldConsume = hasSnake && isFirstAttack && selectedIndices.length === 1;

      [...selectedIndices].sort((a, b) => b - a)
        .forEach(i => {
          const card = scene.handData[i];
          scene._flyToDummy(handPositions[i].x, HAND_Y, card.key);
          const [removed] = scene.handData.splice(i, 1);

          if (shouldConsume) {
            // 영구 제거 (해당 세션 및 추후 저장될 카드 목록에서 제외)
            scene.deck.removeCardById(removed.uid);

            // 인벤토리 여유 확인
            if (scene.player.items.length < scene.player.maxItemCount) {
              // 아이템 획득
              const items = getAllItems();
              const item = items[Math.floor(Math.random() * items.length)];
              scene.player.items.push({
                uid: crypto.randomUUID(),
                id: item.id, name: item.name, desc: item.desc, rarity: item.rarity, img: item.img
              });
              const iName = getItemName(lang, item.id);
              scene.addBattleLog(getUiText(lang, 'battle.log_snake_remove', { card: removed.key, item: iName }));
            } else {
              scene.addBattleLog(getUiText(lang, 'battle.log_snake_full', { card: removed.key }));
            }
          } else {
            scene.dummyData.push(removed);
          }
        });
      scene.render();
    };

    const positions = this.calcMonsterPositions(scene.monsters.length);
    const suitEff = (s) => Math.floor(
      scene.player.attrs[s] * scene.player.adaptability[s] * suitCounts[s]
    );

    const attackCtx = { isAoe: aoe, suitCounts, cardCount: selectedCards.length };

    scene.playAttackAnimation(details, cardFlyInfo, removeCards, () => {
      if (aoe) {
        this._resolveAoe(score, handName, suitCounts, suitEff, positions, attackCtx);
      } else {
        this._resolveSingle(mon, monIdx, score, handName, suitCounts, suitEff, positions, attackCtx);
      }
    });
  }

  // ── 기믹: 유효 DEF (first_turn_def 적용) ──────────────────────────────────
  _getEffectiveDef(mon) {
    const g = mon.gimmick;
    if (g?.type === 'first_turn_def' && g.firstTurnActive) {
      return Math.floor(mon.def * g.defMultiplier);
    }
    return mon.def;
  }

  // ── 기믹: 데미지 감소 여부 판정 ───────────────────────────────────────────
  _applyGimmickResist(mon, damage, attackCtx) {
    const g = mon.gimmick;
    if (!g) return damage;

    let resisted = false;
    switch (g.type) {
      case 'aoe_resist':
        resisted = attackCtx.isAoe;
        break;
      case 'suit_resist':
        resisted = (attackCtx.suitCounts?.[g.suit] ?? 0) > 0;
        break;
      case 'small_hand_resist':
        resisted = attackCtx.cardCount < (g.threshold ?? 4);
        break;
    }

    if (resisted && damage > 0) {
      const lang = getLang(this.scene);
      const mName = getMonsterName(lang, mon.id);
      scene.addBattleLog(getUiText(lang, 'battle.log_gimmick_resist', { gimmick: g.name, name: mName }));
      return Math.floor(damage * g.damageMultiplier);
    }
    return damage;
  }

  _applySuitPlayerEffects(suitCounts, suitEff) {
    const { scene } = this;
    if (suitCounts.H > 0) {
      const eff = suitEff('H');
      scene.player.hp = Math.min(scene.player.maxHp, scene.player.hp + eff);
      if (eff > 0) scene.addBattleLog(getUiText(getLang(scene), 'battle.log_suit_h', { val: eff }));
    }
    if (suitCounts.D > 0) {
      const eff = suitEff('D');
      scene.player.def += eff;
      if (eff > 0) scene.addBattleLog(getUiText(getLang(scene), 'battle.log_suit_d', { val: eff }));
    }
  }

  // ── 광역 공격 처리 ────────────────────────────────────────────────────────
  _resolveAoe(score, handName, suitCounts, suitEff, positions, attackCtx = {}) {
    const { scene } = this;
    const aliveMonsters = scene.monsters.filter(m => !m.isDead);
    const aliveSprites = scene._monsterSprites?.filter((_, i) => !scene.monsters[i]?.isDead) ?? [];

    const lang = getLang(scene);
    // 슈트 적응 효과 (전체 대상)
    if (suitCounts.S > 0) {
      const eff = suitEff('S');
      if (eff > 0) { aliveMonsters.forEach(m => { m.def -= eff; }); scene.addBattleLog(getUiText(lang, 'battle.log_suit_s', { val: eff })); }
    }
    if (suitCounts.C > 0) {
      const eff = suitEff('C');
      if (eff > 0) {
        aliveMonsters.forEach(m => {
          const reduced = Math.min(eff, m.atk);
          m.atk = Math.max(0, m.atk - eff);
          const mName = getMonsterName(lang, m.id);
          if (reduced > 0) scene.addBattleLog(getUiText(lang, 'battle.log_suit_c', { name: mName, val: reduced }));
        });
      }
    }
    this._applySuitPlayerEffects(suitCounts, suitEff);

    scene.player.score += score;
    scene.addBattleLog(getUiText(lang, 'battle.log_aoe_attack', { handName, val: score }));
    scene._sfx("sfx_knifeSlice");

    const aoeX = positions.length > 0
      ? positions.reduce((s, p) => s + p.x, 0) / positions.length
      : GW / 2;
    scene.effects.hitExplosion(aoeX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, aliveSprites);

    aliveMonsters.forEach(m => {
      const monIdx = scene.monsters.indexOf(m);
      const rawDmg = Math.floor(Math.max(0, score - this._getEffectiveDef(m)));
      const dmg = this._applyGimmickResist(m, rawDmg, attackCtx);
      m.hp = Math.max(0, m.hp - dmg);
      if (scene.isBoss && m === scene.monsters[0]) m._damageTaken = (m._damageTaken ?? 0) + dmg;
      const mName = getMonsterName(lang, m.id);
      scene.addBattleLog(getUiText(lang, 'battle.log_damage_to', { target: mName, dmg }));
      if (m.hp <= 0) this._onKill(m, monIdx);
    });

    // 광역 공격 후 보스 패시브 실시간 갱신
    if (scene.isBoss && scene.bossManager) {
      scene.bossManager.refreshStatePassives(scene.monsters[0]);
    }

    scene.isDealing = false;
    scene.render();
    scene._checkLevelUpThenProceed();
  }

  // ── 단일 타겟 공격 처리 ──────────────────────────────────────────────────
  _resolveSingle(mon, monIdx, score, handName, suitCounts, suitEff, positions, attackCtx = {}) {
    const { scene } = this;

    const lang = getLang(scene);
    const mName = getMonsterName(lang, mon.id);
    // 슈트 적응 효과 (데미지 전: ♠DEF감소, ♣ATK감소)
    if (suitCounts.S > 0) {
      const eff = suitEff('S');
      mon.def -= eff;
      if (eff > 0) scene.addBattleLog(getUiText(lang, 'battle.log_suit_s_single', { name: mName, val: eff }));
    }
    if (suitCounts.C > 0) {
      const eff = suitEff('C');
      const reduced = Math.min(eff, mon.atk);
      mon.atk = Math.max(0, mon.atk - eff);
      if (reduced > 0) scene.addBattleLog(getUiText(lang, 'battle.log_suit_c', { name: mName, val: reduced }));
    }

    const rawDamage = Math.floor(Math.max(0, score - this._getEffectiveDef(mon)));
    const damage = this._applyGimmickResist(mon, rawDamage, attackCtx);
    const prevHp = mon.hp;
    mon.hp = Math.max(0, mon.hp - damage);
    if (scene.isBoss) {
      mon._damageTaken = (mon._damageTaken ?? 0) + damage;
      // 데미지 입은 즉시 보스 패시브(HP 비례 방어력 등) 실시간 갱신
      scene.bossManager?.refreshStatePassives(scene.monsters[0]);
    }
    const rawOverkill = Math.max(0, damage - prevHp);
    const bullseye = mon.hp === 0 && damage > 0 && rawOverkill <= Math.floor(mon.maxHp * 0.1);
    const overkill = bullseye ? 0 : rawOverkill;
    scene.player.score += score;
    this._refreshHP(monIdx, mon);

    // 슈트 적응 효과 (데미지 후: ♥HP회복, ♦DEF증가)
    this._applySuitPlayerEffects(suitCounts, suitEff);

    scene.addBattleLog(getUiText(lang, 'battle.log_damage_with', { target: mName, hand: handName, dmg: Math.max(0, damage) }));
    scene._sfx("sfx_knifeSlice");

    const monSprite = scene._monsterSprites?.[monIdx];
    scene.effects.hitLightning(
      monSprite?.x ?? positions[monIdx].x,
      monSprite?.y ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2),
      monSprite ?? null
    );

    // [기존 damaged 스프라이트 애니메이션 주석 처리 — MonsterView.playHit으로 대체]
    // const damagedKey = `${mon.id}_damaged`;
    // if (monSprite instanceof Phaser.GameObjects.Sprite && scene.anims.exists(damagedKey)) {
    //   monSprite.play(damagedKey);
    //   monSprite.once('animationcomplete', () => {
    //     scene.isDealing = false;
    //     this._afterAttack(mon, monIdx, overkill, bullseye);
    //   });
    // } else {
    //   scene.isDealing = false;
    //   this._afterAttack(mon, monIdx, overkill, bullseye);
    // }
    const view = scene.monsterViews?.[monIdx];
    if (view) {
      view.playHit(() => {
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
        const lang = getLang(scene);
        const mName = getMonsterName(lang, mon.id);
        scene.addBattleLog(getUiText(lang, 'battle.log_bullseye', { name: mName, hp: mon.maxHp }));
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

    const positions = this.calcMonsterPositions(scene.monsters.length);
    const aoeX = positions[fromIdx].x;
    const aliveSprites = aliveTargets.map(({ i }) => scene._monsterSprites?.[i]).filter(Boolean);
    scene.effects.hitExplosion(aoeX, MONSTER_AREA_TOP + MONSTER_AREA_H / 2, aliveSprites);

    aliveTargets.forEach(({ m, i }) => {
      const actualDmg = Math.max(0, dmg - m.def);
      m.hp = Math.max(0, m.hp - actualDmg);
      const lang = getLang(scene);
      const mName = getMonsterName(lang, m.id);
      scene.addBattleLog(getUiText(lang, 'battle.log_bullseye_chain', { target: mName, dmg: actualDmg }));
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

    const positions = this.calcMonsterPositions(scene.monsters.length);
    const fromSprite = scene._monsterSprites?.[fromIdx];
    const toSprite = scene._monsterSprites?.[idx];
    scene.effects.hitChainLightning(
      fromSprite?.x ?? positions[fromIdx].x,
      fromSprite?.y ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2),
      toSprite?.x ?? positions[idx].x,
      toSprite?.y ?? (MONSTER_AREA_TOP + MONSTER_AREA_H / 2),
      toSprite ?? null
    );
    scene._sfx("sfx_knifeSlice");

    scene.time.delayedCall(120, () => {
      const target = scene.monsters[idx];
      const actualDmg = Math.max(0, dmg - target.def);
      const prevHp = target.hp;
      target.hp = Math.max(0, target.hp - actualDmg);
      const chain = Math.max(0, actualDmg - prevHp);
      this._refreshHP(idx, target);
      const lang = getLang(scene);
      const tName = getMonsterName(lang, target.id);
      scene.addBattleLog(getUiText(lang, 'battle.log_overkill_chain', { target: tName, dmg: actualDmg }));

      if (target.hp <= 0 && !target.isDead) {
        const killLabel = getUiText(lang, 'battle.log_overkill_kill', { name: tName, xp: target.xp });
        this._onKill(target, idx, killLabel);
        if (chain > 0) {
          scene.time.delayedCall(120, () => this._applyOverkill(idx, chain, onDone));
        } else {
          onDone?.();
        }
      } else {
        // [기존 damaged 스프라이트 애니메이션 주석 처리 — MonsterView.playHit으로 대체]
        // const damagedKey = `${target.id}_damaged`;
        // if (toSprite instanceof Phaser.GameObjects.Sprite && scene.anims.exists(damagedKey)) {
        //   toSprite.play(damagedKey);
        //   toSprite.once('animationcomplete', () => onDone?.());
        // } else {
        //   onDone?.();
        // }
        const targetView = scene.monsterViews?.[idx];
        if (targetView) {
          targetView.playHit(() => onDone?.());
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
    // [기존 sprite 애니메이션 주석 처리 — MonsterView.playDie으로 대체]
    // const dieKey = `${mon.id}_die`;
    // if (this.scene.anims.exists(dieKey)) view.sprite.play(dieKey);
    view.playDie();
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
      const lang = getLang(scene);
      const mName = getMonsterName(lang, m.id);
      scene.addBattleLog(getUiText(lang, 'battle.log_monster_attack', { name: mName, dmg }));
      this._showMonsterAttack(monIdx, dmg);
    }
  }

  // ── 몬스터 스킬 사용 ─────────────────────────────────────────────────────
  _useMonsterSkill(monIdx, m) {
    const { scene } = this;
    const skill = m.skill;

    this._playMonAnim(monIdx, 'skill');

    if (skill.type === 'damage') {
      const raw = skill.value ?? Math.floor(m.atk * (skill.damMult ?? 1));
      const dmg = Math.max(0, raw - scene.player.def);
      scene.player.hp = Math.max(0, scene.player.hp - dmg);
      const lang = getLang(scene);
      const mName = getMonsterName(lang, m.id);
      const sName = getMonsterSkillName(lang, skill.name, skill.name);
      scene.addBattleLog(getUiText(lang, 'battle.log_monster_skill', { name: mName, skill: sName, dmg }));
      // 스킬은 보라빛 플래시 + 약간 더 강한 shake
      scene.time.delayedCall(80, () => {
        this._showPlayerHitEffect(dmg, {
          sfx: 'sfx_knifeSlice',
          tint: 0xee44ff,
          shakeIntensity: 0.018,
          flashColor: 0x880088,
        });
      });

    } else if (skill.type === 'debuff') {
      scene.debuffManager.applyDebuff(skill.debuffId ?? skill.value, m.name);
      scene.render();
      scene.cameras.main.shake(180, 0.009);
      const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x440044, 0.22).setDepth(500);
      scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
      scene._sfx("sfx_chop");
    }
  }

  // ── 몬스터 일반 공격 연출 ────────────────────────────────────────────────
  // orb 없이: 돌진 tween 피크(~190ms)에 플레이어 패널 피격 효과 발동
  _showMonsterAttack(monIdx, damage) {
    const { scene } = this;
    this._playMonAnim(monIdx, 'attack');
    scene.time.delayedCall(190, () => this._showPlayerHitEffect(damage));
  }
}
