const OPTION_KEY = 'game_options';

export function loadOptions() {
    try {
        return JSON.parse(localStorage.getItem(OPTION_KEY)) || {
            bgmVolume: 7,
            sfxVolume: 7,
            lang: 'en'
        };
    } catch {
        return {
            bgmVolume: 7,
            sfxVolume: 7,
            lang: 'en'
        };
    }
}

export function saveOptions(options) {
    localStorage.setItem(OPTION_KEY, JSON.stringify(options));
}

export function saveOptionsByRegistry() {
    localStorage.setItem(OPTION_KEY, JSON.stringify({
        bgmVolume: this.registry.get("bgmVolume"),
        sfxVolume: this.registry.get("sfxVolume"),
        lang: this.registry.get("lang")
    }));
}