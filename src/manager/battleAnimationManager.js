import {
  GW, GH, CW, CH, FIELD_CW, FIELD_CH,
  PLAYER_PANEL_W, ITEM_PANEL_W,
  FIELD_Y, HAND_Y, DEAL_DELAY, ANIM_SPEED
} from "../constants.js";
import { TS } from "../textStyles.js";
import { getLang, getHandName } from "../service/langService.js";

/**
 * BattleAnimationManager - 전투 중의 복잡한 애니메이션을 담당
 */
export class BattleAnimationManager {
  constructor(scene) {
    this.scene = scene;
    this.animObjs = [];
    this._isAnimatingDraw = false;
  }

  /**
   * 덱 비주얼 스택 생성
   */
  createDeckStack() {
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    for (let i = Math.min(8, 51); i >= 0; i--) {
      this.animObjs.push(
        this.scene.add.image(deckX - i * 2, deckY - i * 2, "card_back")
          .setDisplaySize(FIELD_CW, FIELD_CH).setDepth(i)
      );
    }
  }

  /**
   * 카드를 특정 위치로 날려 보내는 기본 애니메이션
   */
  flyCard(cardData, fromX, fromY, toX, toY, options = {}) {
    let cardWidth = (toY === FIELD_Y) ? FIELD_CW : CW;
    let cardHeight = (toY === FIELD_Y) ? FIELD_CH : CH;

    // 약간 축소된 크기로 시작
    cardWidth = cardWidth * 0.85;
    cardHeight = cardHeight * 0.85;

    const startTex = options.immediateFace ? cardData.key : "card_back";
    const img = this.scene.add.image(fromX, fromY, startTex)
      .setDisplaySize(cardWidth, cardHeight).setDepth(200);
    this.animObjs.push(img);

    // 이미 뒷면 상태인 경우(보스 효과 등), 뒤집기 애니메이션 생략
    if (cardData.flipped && !options.immediateFace) {
      this.scene.tweens.add({
        targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
        onComplete: () => options.onComplete?.(img)
      });
      return;
    }

    if (options.immediateFace) {
      this.scene.tweens.add({
        targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
        onComplete: () => options.onComplete?.(img)
      });
      return;
    }

    this.scene.tweens.add({
      targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: img, displayWidth: 1, duration: 70, ease: "Linear",
          onComplete: () => {
            img.setTexture(cardData.key);
            img.setDisplaySize(1, cardHeight);
            this.scene.tweens.add({
              targets: img, displayWidth: cardWidth, duration: 70, ease: "Linear",
              onComplete: () => options.onComplete?.(img)
            });
          },
        });
      },
    });
  }

  /**
   * 핸드로 카드 배분
   */
  dealToHand(startDelay, handData) {
    const handPos = this.scene.calcHandPositions(handData.length);
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let delay = startDelay;

    handData.forEach((card, i) => {
      this.scene.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, handPos[i].x, handPos[i].y));
      delay += DEAL_DELAY;
    });
    return delay;
  }

  /**
   * 필드로 카드 배분
   */
  dealToField(startDelay, fieldData) {
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let delay = startDelay;

    fieldData.forEach(card => {
      this.scene.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y));
      delay += DEAL_DELAY;
    });
    return delay;
  }

  /**
   * 초기 배분 애니메이션 통합
   */
  startDealAnimation(handData, fieldData, onComplete) {
    this.scene._sfx("sfx_shuffle");
    this.createDeckStack();

    let delay = 300;
    delay = this.dealToHand(delay, handData);
    delay = this.dealToField(delay, fieldData);

    this.scene.time.delayedCall(delay + 550, () => {
      this.clearAnimObjs();
      onComplete?.();
    });
  }

  /**
   * 공격 애니메이션 (점수 카운팅 + orb)
   * 가독성을 위해 단계를 분리하고 헬퍼 메서드를 활용하도록 리팩토링함.
   */
  playAttackAnimation(details, cardFlyInfo, onCardsConsumed, onComplete) {
    // 1. 초기 상태 및 컨텍스트 설정
    const ctx = this._initAttackContext(details);
    const queue = [];

    // 2. 점수 텍스트 UI 생성
    ctx.scoreTxt = this._createScoreText(ctx);
    ctx.orbTarget = { x: ctx.cX, y: ctx.scoreY + 15 };

    // 3. 애니메이션 단계 구성 (Queue 채우기)
    this._buildInitialSteps(queue, ctx, details);
    this._buildCardSteps(queue, ctx, cardFlyInfo);
    this._buildRelicSteps(queue, ctx, details);
    this._buildTimesMultiSteps(queue, ctx, details); // Merge 이전으로 이동
    this._buildMergeStep(queue, ctx, details);

    // 카드 소비(더미로 이동) 시점 추가
    if (cardFlyInfo.length > 0) {
      queue.push(next => { onCardsConsumed?.(); next(); });
    }

    // 최종 마무리 및 정리 단계 추가
    this._buildFinalSteps(queue, ctx, onComplete);

    // 4. 애니메이션 시작
    const runNext = () => {
      if (queue.length === 0) return;
      const step = queue.shift();
      step(runNext);
    };
    runNext();
  }

  // ── 내부 헬퍼 메서드 (playAttackAnimation 전용) ──────────────────────────

  _initAttackContext(details) {
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;
    return {
      base: 0,
      multi: 0,
      times: 1,
      score: 0,
      isMerged: false,
      cX: PW + FAW / 2,
      scoreY: 80 + 30, // MONSTER_AREA_TOP = 80
      tmpObjs: [],
      orbTarget: { x: 0, y: 0 },
      scoreTxt: null,
      handNameTxt: null,
      details
    };
  }

  _createScoreText(ctx) {
    const txt = this.scene.add.text(ctx.cX, ctx.scoreY, "", {
      fontFamily: TS.defaultFont,
      fontSize: '32px', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(400);

    ctx.scoreTxt = txt;
    ctx.tmpObjs.push(txt);

    // 족보 이름 미리 생성하여 표시 (초기 알파 0)
    const lang = getLang(this.scene);
    const handLabel = getHandName(lang, ctx.details.handName);
    ctx.handNameTxt = this.scene.add.text(ctx.cX, ctx.scoreY - 24, handLabel, {
      fontFamily: TS.defaultFont, fontSize: '20px', color: '#aaddff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(400).setAlpha(0);
    ctx.tmpObjs.push(ctx.handNameTxt);

    this._updateScoreDisplay(ctx);
    return txt;
  }

  _updateScoreDisplay(ctx) {
    if (ctx.isMerged) {
      ctx.scoreTxt.setText(String(Math.floor(ctx.score)));
    } else {
      ctx.scoreTxt.setText(`${Math.floor(ctx.base)} X ${parseFloat(ctx.multi.toFixed(1))}`);
    }
  }

  _throwOrbLabel(ctx, fromX, fromY, color, label) {
    const txt = this.scene.add.text(fromX, fromY, label, {
      fontFamily: TS.defaultFont,
      fontSize: '20px', color: '#ffffff',
      stroke: Phaser.Display.Color.IntegerToColor(color).rgba,
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(420);
    ctx.tmpObjs.push(txt);

    const cpX = (fromX + ctx.orbTarget.x) / 2;
    const cpY = Math.min(fromY, ctx.orbTarget.y) - 60;
    const t = { v: 0 };

    this.scene.tweens.add({
      targets: t, v: 1, duration: ANIM_SPEED.orbFlight, ease: 'Sine.easeIn',
      onUpdate: () => {
        const s = t.v, r = 1 - s;
        const x = r * r * fromX + 2 * r * s * cpX + s * s * ctx.orbTarget.x;
        const y = r * r * fromY + 2 * r * s * cpY + s * s * ctx.orbTarget.y;
        txt.setPosition(x, y);
      },
      onComplete: () => {
        this.scene.tweens.add({
          targets: txt,
          scaleX: 2.5, scaleY: 2.5, alpha: 0,
          duration: ANIM_SPEED.orbFade, ease: 'Sine.easeOut',
        });
      },
    });
  }

  _relicPos(relicId) {
    const r = this.scene.itemUI?._relicObjs?.[relicId];
    return r ? { x: r.baseCX, y: r.baseCY } : { x: GW - ITEM_PANEL_W / 2, y: 200 };
  }

  _prepareCountUp(ctx) {
    this.scene._sfx("sfx_orb");
    this.scene.tweens.killTweensOf(ctx.scoreTxt);
    ctx.scoreTxt.y = ctx.scoreY;
    this.scene.tweens.add({
      targets: ctx.scoreTxt, y: ctx.scoreY - 12,
      duration: 56, // 140 * 0.4
      yoyo: true, ease: 'Sine.easeOut',
    });
  }

  _countUpValue(ctx, key, targetValue, duration, onDone) {
    this._prepareCountUp(ctx);
    const tweenObj = { [key]: ctx[key] };
    this.scene.tweens.add({
      targets: tweenObj,
      [key]: targetValue,
      duration, ease: 'Circular.In',
      onUpdate: () => {
        ctx[key] = tweenObj[key];
        this._updateScoreDisplay(ctx);
      },
      onComplete: () => {
        ctx[key] = targetValue;
        this._updateScoreDisplay(ctx);
        onDone?.();
      },
    });
  }

  _punchMilestone(scoreTxt) {
    const cs = scoreTxt.scaleX;
    scoreTxt.setScale(cs * 1.5, cs * 1.5);
    this.scene.tweens.add({
      targets: scoreTxt, scaleX: cs, scaleY: cs, duration: 240, ease: 'Back.Out',
    });
    this.scene.cameras.main.shake(170, 0.009);
    const flash = this.scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0xffffff, 0.22).setDepth(500);
    this.scene.tweens.add({
      targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy(),
    });
    this.scene._sfx("sfx_milestone");
  }

  _countUpScoreWithMilestones(ctx, targetScore, duration, onDone) {
    const startVal = ctx.score;
    const milestones = [1000, 10000, 100000].filter(m => startVal < m && m <= targetScore);
    const passed = [];
    const triggered = new Set();
    const tweenObj = { v: startVal };

    const tickTimer = this.scene.time.addEvent({
      delay: 60, loop: true,
      callback: () => this.scene.sound.play("sfx_tick", { volume: 0.15 })
    });

    this.scene.tweens.add({
      targets: tweenObj, v: targetScore, duration, ease: 'Power2.Out',
      onUpdate: () => {
        ctx.score = tweenObj.v;
        this._updateScoreDisplay(ctx);
        for (const m of milestones) {
          if (!triggered.has(m) && ctx.score >= m) {
            triggered.add(m);
            passed.push(m);
          }
        }
      },
      onComplete: () => {
        tickTimer.remove();
        ctx.score = targetScore;
        this._updateScoreDisplay(ctx);

        if (passed.length > 0) {
          let idx = 0;
          const playNext = () => {
            if (idx < passed.length) {
              this._punchMilestone(ctx.scoreTxt);
              idx++;
              this.scene.time.delayedCall(240, playNext);
            } else onDone?.();
          };
          playNext();
        } else onDone?.();
      },
    });
  }

  // ── Queue 빌더 메서드 ──────────────────────────────────────────────────

  _buildInitialSteps(queue, ctx, details) {
    // 0. Hand Name Fade In
    queue.push(next => {
      this.scene.tweens.add({
        targets: ctx.handNameTxt, alpha: 1, duration: 200,
        onComplete: next
      });
    });

    // 1. Hand Rank Multi
    queue.push(next => {
      this.scene.playerUI?.pulseHandRow(details.handRank);
      if (details.baseHandMulti > 0) {
        const PW = PLAYER_PANEL_W;
        const rankRow = this.scene.playerUI?._handConfigRows?.[details.handRank];
        this._throwOrbLabel(ctx, rankRow?.multiTxt?.x ?? PW / 2, rankRow?.multiTxt?.y ?? 400, 0x44eeff, `x${details.baseHandMulti}`);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => this._countUpValue(ctx, 'multi', details.baseHandMulti, ANIM_SPEED.countUp, next));
      } else next();
    });

    // 2. ATK Base
    if (details.atk > 0) {
      queue.push(next => {
        this.scene.playerUI?.pulseAtk();
        const PW = PLAYER_PANEL_W;
        const atkText = this.scene.playerUI?.playerAtkTxt;
        this._throwOrbLabel(ctx, atkText ? atkText.x : PW * 0.75, atkText ? atkText.y : 168, 0xff8833, `+${details.atk}`);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => this._countUpValue(ctx, 'base', ctx.base + details.atk, ANIM_SPEED.countUp, next));
      });
    }
  }

  _buildCardSteps(queue, ctx, cardFlyInfo) {
    cardFlyInfo.forEach((info) => {
      queue.push(next => {
        if (info.isFlipped && info.obj?.active) info.obj.setTexture(info.key);
        this._pulseCardObj(info.obj);

        if (info.scoringDetail) {
          const cd = info.scoringDetail;
          this._throwOrbLabel(ctx, info.fromX, info.fromY, 0xffdd44, `+${cd.baseScore}`);
          this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
            this._countUpValue(ctx, 'base', ctx.base + cd.baseScore, ANIM_SPEED.countUp, () => {
              // 해당 카드의 씰/유물 효과 처리 (Times Multi 제외)
              this._addCardSpecificRelicSteps(queue, ctx, cd.cardRelicDeltas);
              next();
            });
          });
        } else next();
      });
    });
  }

  _pulseCardObj(obj) {
    if (!obj?.active) return;
    this.scene.tweens.killTweensOf(obj);
    const bx = obj.scaleX, by = obj.scaleY;
    this.scene.tweens.add({
      targets: obj, scaleX: bx * 1.1, scaleY: by * 1.1,
      duration: ANIM_SPEED.pulseCard, yoyo: true, ease: 'Sine.easeInOut',
      onComplete: () => { try { obj.setScale(bx, by); } catch (_) { } },
    });
  }

  /** 카드 개별에 붙은 유물/씰 효과 연출 (Base, PlusMulti) */
  _addCardSpecificRelicSteps(queue, ctx, deltas) {
    deltas.forEach(({ relicId, type, value }) => {
      if (type === 'times_multi') return; // Times 멀티는 최후에 일괄 처리
      queue.unshift(next => { // 현재 카드 처리 직후에 끼워넣기 위해 unshift
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = this._relicPos(relicId);
        const isBase = type === 'base';
        const displayVal = isBase ? Math.floor(value) : Number(value.toFixed(2));
        const label = isBase ? `+${displayVal}` : `+${displayVal}X`;
        this._throwOrbLabel(ctx, rp.x, rp.y, isBase ? 0xcc88ff : 0x44eeff, label);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          if (isBase) this._countUpValue(ctx, 'base', ctx.base + value, ANIM_SPEED.countUp, next);
          else this._countUpValue(ctx, 'multi', ctx.multi + value, ANIM_SPEED.countUp, next);
        });
      });
    });
  }

  _buildRelicSteps(queue, ctx, details) {
    // Hand Relic (Base + PlusMulti)
    details.handRelicDeltas.forEach(({ relicId, type, value }) => {
      if (type === 'times_multi') return;
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = this._relicPos(relicId);
        const isBase = type === 'base';
        const displayVal = isBase ? Math.floor(value) : Number(value.toFixed(2));
        const label = isBase ? `+${displayVal}` : `+${displayVal}X`;
        this._throwOrbLabel(ctx, rp.x, rp.y, isBase ? 0xcc88ff : 0x44eeff, label);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          if (isBase) this._countUpValue(ctx, 'base', ctx.base + value, ANIM_SPEED.countUp, next);
          else this._countUpValue(ctx, 'multi', ctx.multi + value, ANIM_SPEED.countUp, next);
        });
      });
    });

    // Final Relic (Base + PlusMulti)
    details.finalRelicDeltas.forEach(({ relicId, type, value }) => {
      if (type !== 'plus_multi' && type !== 'base') return;
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = this._relicPos(relicId);
        const isBase = type === 'base';
        const displayVal = isBase ? Math.floor(value) : Number(value.toFixed(2));
        const label = isBase ? `+${displayVal}` : `+${displayVal}X`;
        this._throwOrbLabel(ctx, rp.x, rp.y, isBase ? 0xee66ff : 0x44eeff, label);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          if (isBase) this._countUpValue(ctx, 'base', ctx.base + value, ANIM_SPEED.countUp, next);
          else this._countUpValue(ctx, 'multi', ctx.multi + value, ANIM_SPEED.countUp, next);
        });
      });
    });
  }

  _buildMergeStep(queue, ctx, details) {
    queue.push(next => {
      const mergedScore = Math.floor(ctx.base * ctx.multi);
      ctx.isMerged = true;
      ctx.score = ctx.base;
      this._updateScoreDisplay(ctx);

      const destX = GW / 2, destY = GH * 0.36;

      this.scene.tweens.killTweensOf(ctx.scoreTxt);
      this.scene.tweens.add({
        targets: [ctx.scoreTxt, ctx.handNameTxt],
        x: destX, y: destY, scaleX: 1.8, scaleY: 1.8,
        duration: 300, ease: 'Back.easeOut',
        onComplete: () => {
          ctx.orbTarget.x = destX;
          ctx.orbTarget.y = destY + ctx.scoreTxt.height * ctx.scoreTxt.scaleY * 0.5;
          this._countUpScoreWithMilestones(ctx, mergedScore, 420, next);
        },
      });
    });
  }

  _buildTimesMultiSteps(queue, ctx, details) {
    const allTimesDeltas = [];
    details.cardDetails.forEach(cd => cd.cardRelicDeltas.forEach(d => { if (d.type === 'times_multi') allTimesDeltas.push(d); }));
    details.handRelicDeltas.forEach(d => { if (d.type === 'times_multi') allTimesDeltas.push(d); });
    details.finalRelicDeltas.forEach(d => { if (d.type === 'times_multi') allTimesDeltas.push(d); });

    allTimesDeltas.forEach(({ relicId, value }) => {
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = this._relicPos(relicId);

        // ratio(value)를 직접 곱해서 target 계산
        const targetMulti = ctx.multi * value;
        const displayRatio = Number(value.toFixed(2));

        this._throwOrbLabel(ctx, rp.x, rp.y, 0xff0044, `x${displayRatio}`);

        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          this._countUpValue(ctx, 'multi', targetMulti, Math.round(ANIM_SPEED.countUp * 1.5), next);
        });
      });
    });
  }

  _buildFinalSteps(queue, ctx, onComplete) {
    queue.push(next => {
      const cs = ctx.scoreTxt.scaleX;
      ctx.scoreTxt.setScale(cs * 1.25, cs * 1.25);
      this.scene.tweens.add({
        targets: ctx.scoreTxt, scaleX: cs, scaleY: cs,
        duration: ANIM_SPEED.mergeScale, ease: 'Back.Out',
        onComplete: () => this.scene.time.delayedCall(Math.round(ANIM_SPEED.mergeDelay * 0.6), next),
      });
    });

    queue.push(next => {
      this.scene.tweens.add({
        targets: ctx.tmpObjs, alpha: 0, duration: 180,
        onComplete: () => {
          ctx.tmpObjs.forEach(o => { try { o?.destroy(); } catch (_) { } });
          ctx.tmpObjs.length = 0;
          onComplete?.();
          next();
        },
      });
    });
  }

  animateDraw(cards, handData, onComplete) {
    if (!cards?.length) { onComplete?.(); return; }
    const deckX = PLAYER_PANEL_W + 50;
    const deckY = FIELD_Y;
    const baseLen = handData.length;
    const allPos = this.scene.calcHandPositions(baseLen + cards.length);

    let delay = 0;
    let completed = 0;

    cards.forEach((card, ci) => {
      const pos = allPos[baseLen + ci];
      this.scene.time.delayedCall(delay, () => {
        this.scene._sfx('sfx_slide');
        this.flyCard(card, deckX, deckY, pos?.x ?? GW / 2, HAND_Y, {
          onComplete: (img) => {
            img.destroy();
            handData.push(card);
            this.scene.render();
            completed++;
            if (completed >= cards.length) {
              onComplete?.();
            }
          }
        });
      });
      delay += DEAL_DELAY;
    });
  }

  animateField(fieldCards, onComplete) {
    if (!fieldCards?.length) { onComplete?.(); return; }
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let completed = 0;

    fieldCards.forEach((card, i) => {
      this.scene.time.delayedCall(i * DEAL_DELAY, () => {
        this.scene._sfx('sfx_slide');
        this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y, {
          onComplete: (img) => {
            img.destroy();
            completed++;
            if (completed === fieldCards.length) onComplete?.();
          }
        });
      });
    });
  }

  flyToDummy(fromX, fromY, key = "card_back") {
    this.scene._sfx("sfx_fan");
    const img = this.scene.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.scene.tweens.add({
      targets: img, x: GW - ITEM_PANEL_W - 40, y: FIELD_Y,
      displayWidth: CW * 0.3, displayHeight: CH * 0.3, alpha: 0,
      duration: 380, ease: "Power2.In",
      onComplete: () => img.destroy(),
    });
  }

  clearAnimObjs() {
    this.animObjs.forEach(o => o.destroy());
    this.animObjs = [];
  }

  /**
   * 보스 스킬 발동 시 화면 중앙에 멋진 알림 표시
   * @param {string} title - 스킬 이름 (예: "랭크 봉인")
   * @param {string} detailText - 구체적 내용 (예: "[7] 사용 불가")
   * @param {number} [color=0xff3333] - 강조 색상
   */
  showBossSkillNotice(title, detailText, color = 0xff3333) {
    const scene = this.scene;
    const centerX = GW / 2;
    const centerY = GH / 2;

    // 1. 검은색 스트립 배경
    const bg = scene.add.rectangle(centerX, centerY, GW, 100, 0x000000, 0.8)
      .setDepth(1000).setAlpha(0).setScale(1, 0);
    
    // 2. 제목 텍스트
    const titleTxt = scene.add.text(centerX, centerY - 20, title, {
      fontFamily: TS.defaultFont, fontSize: '24px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1001).setAlpha(0);

    // 3. 상세 내용 텍스트 (강조 색상)
    const detailTxt = scene.add.text(centerX, centerY + 22, detailText, {
      fontFamily: TS.defaultFont, fontSize: '18px',
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1001).setAlpha(0);

    // ── 연출 시작 ──
    scene._sfx("sfx_milestone"); // 혹은 다른 임팩트 있는 효과음

    // 배경 스트립 확장 및 페이드인
    scene.tweens.add({
      targets: bg,
      alpha: 1, scaleY: 1,
      duration: 300, ease: 'Back.easeOut'
    });

    // 텍스트 페이드인 및 펄스
    scene.tweens.add({
      targets: [titleTxt, detailTxt],
      alpha: 1,
      duration: 400, delay: 100,
      onComplete: () => {
        scene.tweens.add({
          targets: [titleTxt, detailTxt],
          scaleX: 1.05, scaleY: 1.05,
          duration: 1000, yoyo: true, repeat: 1, ease: 'Sine.easeInOut'
        });
      }
    });

    // 일정 시간 후 제거
    scene.time.delayedCall(2500, () => {
      scene.tweens.add({
        targets: [bg, titleTxt, detailTxt],
        alpha: 0,
        scaleY: { targets: bg, value: 0 },
        duration: 300, ease: 'Power2.In',
        onComplete: () => {
          bg.destroy();
          titleTxt.destroy();
          detailTxt.destroy();
        }
      });
    });
  }

  /**
   * 턴 전환 시 화면 중앙에 커다란 안내 표시
   * @param {string} text - "PLAYER TURN" 또는 "ENEMY TURN"
   * @param {string} [color='#ffffff'] - 텍스트 색상
   */
  showTurnNotice(text, color = '#ffffff') {
    const scene = this.scene;
    const centerX = GW / 2;
    const centerY = GH / 2;

    // 1. 검은색 스트립 배경
    const bg = scene.add.rectangle(centerX, centerY, GW, 80, 0x000000, 0.6)
      .setDepth(1999).setAlpha(0).setScale(1, 0);

    // 2. 텍스트
    const txt = scene.add.text(centerX, centerY, text, {
      fontFamily: TS.defaultFont, fontSize: '42px', color,
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2000).setAlpha(0).setScale(0.5);

    // 배경 스트립 확장
    scene.tweens.add({
      targets: bg,
      alpha: 1, scaleY: 1,
      duration: 300, ease: 'Back.easeOut'
    });

    scene.tweens.add({
      targets: txt,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 400, ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: txt,
          scaleX: 1.1, scaleY: 1.1,
          duration: 800, yoyo: true, ease: 'Sine.easeInOut'
        });
      }
    });

    scene.time.delayedCall(1200, () => {
      scene.tweens.add({
        targets: [txt, bg],
        alpha: 0,
        scaleX: { targets: txt, value: 1.5 },
        scaleY: { targets: [txt, bg], value: 1.5 },
        duration: 300, ease: 'Power2.In',
        onComplete: () => {
          txt.destroy();
          bg.destroy();
        }
      });
    });
  }
}
