import langData from '../data/lang.json';

export function getHandName(lang, handKey) {
  return langData[lang]?.hand?.[handKey]?.name ?? handKey;
}
