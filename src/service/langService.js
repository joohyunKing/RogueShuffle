import langData from '../data/lang.json';

/** scene(또는 registry를 가진 객체)에서 현재 언어 설정을 읽는다 */
export function getLang(scene) {
  return scene?.registry?.get('lang') ?? 'ko';
}

export function getHandName(lang, handKey) {
  return langData[lang]?.hand?.[handKey]?.name ?? handKey;
}

export function getHandDesc(lang, handKey) {
  return langData[lang]?.hand?.[handKey]?.desc ?? '';
}

/** playerUI 섹션 전체 반환 (fallback: ko) */
export function getPlayerUI(lang) {
  return langData[lang]?.playerUI ?? langData['ko'].playerUI;
}

/** market 섹션 전체 반환 (fallback: ko) */
export function getMarket(lang) {
  return langData[lang]?.market ?? langData['ko'].market;
}

export function getItemName(lang, id, fallback = id) {
  return langData[lang]?.item?.[id]?.name ?? fallback;
}

export function getItemDesc(lang, id, fallback = '') {
  return langData[lang]?.item?.[id]?.desc ?? fallback;
}

export function getRelicName(lang, id, fallback = id) {
  return langData[lang]?.relic?.[id]?.name ?? fallback;
}

export function getRelicDesc(lang, id, fallback = '') {
  return langData[lang]?.relic?.[id]?.desc ?? fallback;
}

export function getSealName(lang, id, fallback = id) {
  return langData[lang]?.seal?.[id]?.name ?? fallback;
}

export function getSealDesc(lang, id, fallback = '') {
  return langData[lang]?.seal?.[id]?.desc ?? fallback;
}

export function getBossName(lang, id, fallback = id) {
  return langData[lang]?.boss?.names?.[id] ?? fallback;
}

export function getBossSkillName(lang, id, fallback = id) {
  return langData[lang]?.boss?.skills?.[id]?.name ?? fallback;
}

export function getBossSkillDesc(lang, id, fallback = '') {
  return langData[lang]?.boss?.skills?.[id]?.desc ?? fallback;
}

export function getMonsterName(lang, id, fallback = id) {
  return langData[lang]?.monster?.names?.[id] ?? fallback;
}

export function getMonsterSkillName(lang, id, fallback = id) {
  return langData[lang]?.monster?.skills?.[id] ?? fallback;
}

export function getGimmickName(lang, id, fallback = id) {
  return langData[lang]?.battle?.gimmick?.[id]?.name ?? fallback;
}

export function getGimmickDesc(lang, id, values = {}) {
  let str = langData[lang]?.battle?.gimmick?.[id]?.desc ?? id;
  for (const [k, v] of Object.entries(values)) {
    str = str.replaceAll(`{${k}}`, v);
  }
  return str;
}

/** 템플릿 문자열 치환 — {key} → values[key] */
export function getUiText(lang, key, values = {}) {
  let str = "";

  if (key.includes('.')) {
    // 중첩 경로 지원 (예: 'battle.log_kill')
    const parts = key.split('.');
    let obj = langData[lang];
    for (const p of parts) {
      obj = obj?.[p];
    }
    str = (typeof obj === 'string') ? obj : key;
  } else {
    // 하위 호환성: 점이 없는 경우 기본적으로 'ui' 섹션에서 검색
    str = langData[lang]?.ui?.[key] ?? key;
  }

  for (const [k, v] of Object.entries(values)) {
    str = str.replaceAll(`{${k}}`, v);
  }
  return str;
}
