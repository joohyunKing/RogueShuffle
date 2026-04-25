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

/** 템플릿 문자열 치환 — {key} → values[key] */
export function getUiText(lang, key, values = {}) {
  let str = langData[lang]?.ui?.[key] ?? key;
  for (const [k, v] of Object.entries(values)) {
    str = str.replaceAll(`{${k}}`, v);
  }
  return str;
}
