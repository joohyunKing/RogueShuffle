import { CW, CH, FIELD_CW, FIELD_CH, HAND_Y, HAND_TOP } from "../constants.js";

/**
 * BattleDragManager - 전투 중 카드 및 아이템의 드래그 로직을 전담 관리합니다.
 */
export class BattleDragManager {
  constructor(scene) {
    this.scene = scene;
    this.isDragging = false;
    
    this._dragSealImg = null;
    this._dragSealOffsetX = 0;
    this._dragSealOffsetY = 0;
    this._pendingToggleIdx = null;
    this._lastWiggleObj = null;

    this.setupDrag();
  }

  setupDrag() {
    const { scene } = this;
    scene.input.dragDistanceThreshold = 6;

    scene.events.once('shutdown', () => {
      scene.input.off('dragstart');
      scene.input.off('drag');
      scene.input.off('dragend');
    });

    scene.input.on("dragstart", (pointer, obj) => this._handleDragStart(pointer, obj));
    scene.input.on("drag", (pointer, obj, dragX, dragY) => this._handleDrag(pointer, obj, dragX, dragY));
    scene.input.on("dragend", (pointer, obj) => this._handleDragEnd(pointer, obj));
  }

  _handleDragStart(pointer, obj) {
    const { scene } = this;
    if (scene.isDealing) return;
    
    scene._sfx("sfx_slide");
    scene.isDragging = true;
    obj.setDepth(200);

    if (obj.getData("itemIndex") !== undefined) {
      scene.tweens.killTweensOf(obj);
      scene.tweens.add({ targets: obj, scaleX: 0.9, scaleY: 0.9, duration: 60 });
    } else if (obj.getData("handIndex") !== undefined) {
      // 핸드 카드 드래그 시작
      scene._pendingToggleIdx = null;
      this._lastWiggleObj = null;
      scene.tweens.killTweensOf(obj);
      obj.setY(HAND_Y);

      // 씬 관리 리스트에서 제거 (렌더링 시 파괴 방지)
      const cIdx = scene.cardObjs.indexOf(obj);
      if (cIdx !== -1) scene.cardObjs.splice(cIdx, 1);
      const hIdx = scene.handCardObjs?.indexOf(obj);
      if (hIdx !== -1 && hIdx !== undefined) scene.handCardObjs?.splice(hIdx, 1);

      this._trackSeal(obj);
    } else {
      // 필드 카드 드래그 시작
      obj.setDisplaySize(Math.round(CW * 0.9), Math.round(CH * 0.9));
      const idx = scene.cardObjs.indexOf(obj);
      if (idx !== -1) scene.cardObjs.splice(idx, 1);

      this._trackSeal(obj);
    }
  }

  _handleDrag(pointer, obj, dragX, dragY) {
    obj.x = dragX;
    obj.y = dragY;

    // 씰 이미지 추적
    if (this._dragSealImg?.active) {
      this._dragSealImg.x = dragX + this._dragSealOffsetX;
      this._dragSealImg.y = dragY + this._dragSealOffsetY;
    }

    // 핸드 카드 전용 : 위글 효과
    if (obj.getData("handIndex") !== undefined) {
      this._wiggleNearestHandCard(pointer.x);
    }
  }

  _handleDragEnd(pointer, obj) {
    const { scene } = this;
    scene.isDragging = false;

    // 1. 아이템 드래그 종료
    if (obj.getData("itemIndex") !== undefined) {
      if (scene._isValidItemDropZone(pointer.x, pointer.y)) {
        scene._useItem(obj.getData("itemIndex"), obj);
      } else {
        scene.tweens.add({
          targets: obj,
          x: obj.getData("origX"), y: obj.getData("origY"),
          scaleX: 1, scaleY: 1,
          duration: 200, ease: "Back.Out",
          onComplete: () => { obj.destroy(); scene.render(); },
        });
      }
      this._clearDragSeal();
      return;
    }

    this._clearDragSeal();

    // 2. 핸드 카드 순서 변경 종료
    if (obj.getData("handIndex") !== undefined) {
      this._lastWiggleObj = null;
      const fromIdx = obj.getData("handIndex");
      const positions = scene.calcHandPositions(scene.handData.length);

      let toIdx = fromIdx;
      let minDist = Infinity;
      positions.forEach((p, i) => {
        const dist = Math.abs(pointer.x - p.x);
        if (dist < minDist) { minDist = dist; toIdx = i; }
      });

      if (toIdx !== fromIdx) {
        const [card] = scene.handData.splice(fromIdx, 1);
        scene.handData.splice(toIdx, 0, card);
        this._recalculateSelectedIndices(fromIdx, toIdx);
      }
      obj.destroy();
      scene.render();
      return;
    }

    // 3. 필드 카드 드래그 종료
    if (pointer.y >= HAND_TOP) {
      const cardData = obj.getData("cardData");
      const fieldIdx = obj.getData("fieldIndex");

      if (scene.handData.length >= scene.player.handSizeLimit) {
        this.snapBack(obj);
        return;
      }

      const newPositions = scene.calcHandPositions(scene.handData.length + 1);
      const insertIdx = newPositions.findIndex(p => pointer.x < p.x);
      const handInsert = insertIdx === -1 ? scene.handData.length : insertIdx;

      scene.fieldData.splice(fieldIdx, 1);
      scene.deck.field = scene.deck.field.filter(c => c.uid !== cardData.uid);
      scene.handData.splice(handInsert, 0, cardData);
      if (scene.sortMode) scene.doSorting(scene.sortMode);
      
      scene.fieldPickCount++;
      scene.selected.clear();
      obj.destroy();
      scene.render();
    } else {
      this.snapBack(obj);
    }
  }

  _trackSeal(obj) {
    const seal = obj.getData("sealImg");
    if (seal?.active) {
      this._dragSealImg = seal;
      this._dragSealOffsetX = seal.x - obj.x;
      this._dragSealOffsetY = seal.y - obj.y;
      seal.setDepth(201);
      const sIdx = this.scene.cardObjs.indexOf(seal);
      if (sIdx !== -1) this.scene.cardObjs.splice(sIdx, 1);
    } else {
      this._dragSealImg = null;
    }
  }

  _clearDragSeal() {
    this._dragSealImg?.destroy();
    this._dragSealImg = null;
  }

  snapBack(obj) {
    const { scene } = this;
    const seal = obj.getData("sealImg");

    if (seal?.active) {
      const offX = seal.x - obj.x;
      const offY = seal.y - obj.y;
      scene.tweens.add({
        targets: seal,
        x: obj.getData("origX") + offX,
        y: obj.getData("origY") + offY,
        duration: 200,
        ease: "Back.Out"
      });
    }

    scene.tweens.add({
      targets: obj,
      x: obj.getData("origX"),
      y: obj.getData("origY"),
      displayWidth: obj.getData("origW") ?? FIELD_CW,
      displayHeight: obj.getData("origH") ?? FIELD_CH,
      duration: 200,
      ease: "Back.Out",
      onComplete: () => { 
        obj.destroy(); 
        seal?.destroy();
        scene.render(); 
      },
    });
  }

  _wiggleNearestHandCard(mouseX) {
    const { scene } = this;
    if (!scene.handCardObjs?.length) return;

    let nearestObj = null;
    let minDist = Infinity;
    scene.handCardObjs.forEach(cardObj => {
      if (!cardObj?.active) return;
      const dist = Math.abs(mouseX - cardObj.x);
      if (dist < minDist) { minDist = dist; nearestObj = cardObj; }
    });

    if (!nearestObj || minDist > 65 || nearestObj === this._lastWiggleObj) return;
    this._lastWiggleObj = nearestObj;

    const baseX = nearestObj.x;
    scene.tweens.killTweensOf(nearestObj);
    scene.tweens.chain({
      targets: nearestObj,
      tweens: [
        { x: baseX - 7, duration: 50, ease: 'Power2.Out' },
        { x: baseX + 7, duration: 50, ease: 'Power2.Out' },
        { x: baseX, duration: 50, ease: 'Back.Out' },
      ],
    });
  }

  _recalculateSelectedIndices(fromIdx, toIdx) {
    const { scene } = this;
    const newSel = new Set();
    for (const idx of scene.selected) {
      if (idx === fromIdx) {
        newSel.add(toIdx > fromIdx ? toIdx - 1 : toIdx);
      } else if (fromIdx < toIdx && idx > fromIdx && idx <= toIdx) {
        newSel.add(idx - 1);
      } else if (fromIdx > toIdx && idx >= toIdx && idx < fromIdx) {
        newSel.add(idx + 1);
      } else {
        newSel.add(idx);
      }
    }
    scene.selected = newSel;
  }
}
