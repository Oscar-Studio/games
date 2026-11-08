const MUSIC_URL = 'https://backgrounds.oscarstudio.cn/backgrounds/game-audio/2048/first_light_particles.m4a';
const NOTES = {
    move: [[330, 0, .055, .08]],
    merge: [[523, 0, .11, .17], [784, .05, .15, .11]],
    start: [[392, 0, .10, .12], [587, .07, .15, .13]],
    end: [[392, 0, .15, .12], [330, .12, .15, .12], [262, .24, .22, .12]],
};

export function setupAudio(panel, saved, save) {
    if (!panel) return;
    const enabled = panel.querySelector('[name="musicEnabled"]');
    const music = panel.querySelector('[name="music"]');
    const effects = panel.querySelector('[name="effects"]');
    const status = panel.querySelector('.audio-status');
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    enabled.checked = saved.musicEnabled === true;
    for (const input of [music, effects]) {
        if (Number.isFinite(saved[input.name])) input.value = saved[input.name];
    }

    let context;
    let musicGain;
    let effectsGain;
    let track;

    function setStatus(message) {
        status.textContent = message;
        status.hidden = !message;
    }

    function updateVolume() {
        for (const input of [music, effects]) input.nextElementSibling.value = `${input.value}%`;
        if (context) {
            musicGain.gain.setTargetAtTime(music.valueAsNumber / 100, context.currentTime, .015);
            effectsGain.gain.setTargetAtTime(effects.valueAsNumber / 100, context.currentTime, .015);
        }
    }

    function syncMusic() {
        if (!enabled.checked || !music.valueAsNumber || document.hidden) {
            track?.pause();
            return;
        }
        if (!context) return;
        if (!track) {
            track = new Audio();
            track.crossOrigin = 'anonymous';
            track.loop = true;
            context.createMediaElementSource(track).connect(musicGain);
            track.addEventListener('error', () => {
                if (enabled.checked) setStatus('背景音乐暂时无法播放。');
            });
            track.src = MUSIC_URL;
        }
        if (track.paused) {
            setStatus('');
            track.play().catch(error => {
                if (error.name === 'AbortError' || !enabled.checked) return;
                setStatus(error.name === 'NotAllowedError' ? '点击棋盘或按方向键后播放音乐。' : '背景音乐暂时无法播放。');
            });
        }
    }

    function unlock() {
        if (!effects.valueAsNumber && !(enabled.checked && music.valueAsNumber)) return;
        if (!AudioContext) {
            if (enabled.checked) setStatus('当前浏览器无法播放游戏音频。');
            return;
        }
        if (!context) {
            try {
                context = new AudioContext();
            } catch {
                setStatus('当前浏览器无法播放游戏音频。');
                return;
            }
            musicGain = context.createGain();
            effectsGain = context.createGain();
            musicGain.gain.value = music.valueAsNumber / 100;
            effectsGain.gain.value = effects.valueAsNumber / 100;
            musicGain.connect(context.destination);
            effectsGain.connect(context.destination);
        }
        if (context.state !== 'running') context.resume().catch(() => {});
        syncMusic();
    }

    function effect(name) {
        if (!context || !effects.valueAsNumber || document.hidden) return;
        for (const [pitch, delay, duration, volume] of NOTES[name]) {
            const start = context.currentTime + delay;
            const oscillator = context.createOscillator();
            const envelope = context.createGain();
            oscillator.frequency.value = pitch;
            envelope.gain.setValueAtTime(.0001, start);
            envelope.gain.exponentialRampToValueAtTime(volume, start + .008);
            envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
            oscillator.connect(envelope).connect(effectsGain);
            oscillator.start(start);
            oscillator.stop(start + duration);
            oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
        }
    }

    function saveSettings() {
        save({ musicEnabled: enabled.checked, music: music.valueAsNumber, effects: effects.valueAsNumber });
    }

    enabled.addEventListener('change', () => {
        saveSettings();
        setStatus('');
        if (enabled.checked) {
            if (track?.error) track.load();
            unlock();
        } else {
            syncMusic();
        }
    });
    music.addEventListener('input', () => {
        updateVolume();
        saveSettings();
        if (enabled.checked && music.valueAsNumber) unlock();
        else syncMusic();
    });
    effects.addEventListener('input', () => {
        updateVolume();
        saveSettings();
    });
    effects.addEventListener('change', () => {
        unlock();
        effect('merge');
    });
    document.addEventListener('visibilitychange', () => {
        if (!context) return;
        if (document.hidden) syncMusic();
        else unlock();
    });
    updateVolume();
    return { unlock, effect };
}
