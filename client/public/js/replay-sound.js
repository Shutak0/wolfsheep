// replay-sound.js — звуковое сопровождение реплея
(function () {
    var sounds = {};
    var loaded = false;
    var useFallback = false;
    var audioCtx = null;
    var mediaStreamDestination = null;
    var SOUND_NAMES = ['move_start', 'my_wall', 'opponent_wall', 'opponent_spam', 'win_sheep', 'win_wolf'];

    function initAudioContext() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('[ReplaySound] Web Audio API not available');
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function getAudioStream() {
        initAudioContext();
        if (!audioCtx) return null;
        if (!mediaStreamDestination) {
            mediaStreamDestination = audioCtx.createMediaStreamDestination();
        }
        return mediaStreamDestination.stream;
    }

    // Синтезирует звук через Web Audio API
    function synthTone(freq, duration, type, vol, glideTo) {
        if (!audioCtx) return;
        type = type || 'square';
        vol = vol || 0.15;
        var now = audioCtx.currentTime;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, now + duration);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration);
    }

    function synthNoise(duration, vol) {
        if (!audioCtx) return;
        vol = vol || 0.08;
        var now = audioCtx.currentTime;
        var bufferSize = audioCtx.sampleRate * duration;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        var source = audioCtx.createBufferSource();
        var gain = audioCtx.createGain();
        var filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.8;
        source.buffer = buffer;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        source.start(now);
        source.stop(now + duration);
    }

    function playFallback(name) {
        initAudioContext();
        if (!audioCtx) return;
        switch (name) {
            case 'move_start':
                synthTone(600, 0.15, 'square', 0.12, 900);
                break;
            case 'my_wall':
                synthNoise(0.2, 0.1);
                synthTone(200, 0.15, 'triangle', 0.08);
                break;
            case 'opponent_wall':
                synthNoise(0.2, 0.08);
                synthTone(180, 0.12, 'triangle', 0.06);
                break;
            case 'opponent_spam':
                for (var i = 0; i < 3; i++) {
                    synthTone(300 + i * 100, 0.1, 'sawtooth', 0.1);
                }
                synthNoise(0.3, 0.12);
                break;
            case 'win_sheep':
                synthTone(523, 0.15, 'square', 0.15, 659);
                setTimeout(function () { synthTone(659, 0.15, 'square', 0.15, 784); }, 150);
                setTimeout(function () { synthTone(784, 0.3, 'square', 0.18); }, 300);
                break;
            case 'win_wolf':
                synthTone(200, 0.2, 'sawtooth', 0.12, 150);
                setTimeout(function () { synthTone(150, 0.3, 'sawtooth', 0.14); }, 200);
                synthNoise(0.4, 0.06);
                break;
        }
    }

    function init() {
        if (loaded) return;
        loaded = true;
        initAudioContext();
        var loadedCount = 0, errorCount = 0;

        SOUND_NAMES.forEach(function (name) {
            var audio = new Audio('/sound/' + name + '.mp3');
            audio.preload = 'auto';
            audio.volume = 0.7;

            audio.addEventListener('canplaythrough', function () {
                loadedCount++;
                console.log('[ReplaySound] Loaded: ' + name + '.mp3 (' + loadedCount + '/' + SOUND_NAMES.length + ')');
            }, { once: true });

            audio.addEventListener('error', function (e) {
                errorCount++;
                console.warn('[ReplaySound] Failed to load: ' + name + '.mp3 (path: /sound/' + name + '.mp3)');
                if (errorCount >= SOUND_NAMES.length) {
                    useFallback = true;
                    console.log('[ReplaySound] All mp3 files missing — switching to Web Audio API synthesis');
                }
            }, { once: true });

            sounds[name] = audio;
        });

        // Если через 2 секунды ни один файл не загрузился — включаем fallback
        setTimeout(function () {
            if (loadedCount === 0 && !useFallback) {
                useFallback = true;
                console.log('[ReplaySound] Timeout: no mp3 loaded — switching to Web Audio API synthesis');
            }
        }, 2000);
    }

    function play(name) {
        console.log('[ReplaySound] Playing: ' + name + ' (fallback=' + useFallback + ')');

        if (useFallback) {
            playFallback(name);
            return;
        }

        var audio = sounds[name];
        if (!audio) {
            console.warn('[ReplaySound] Sound not found: ' + name);
            return;
        }

        // Подключаем audio к MediaStream для записи видео
        if (audioCtx && mediaStreamDestination) {
            try {
                var source = audioCtx.createMediaElementSource(audio);
                source.connect(mediaStreamDestination);
                source.connect(audioCtx.destination);
            } catch (e) {
                // Уже подключён — игнорируем
            }
        }

        audio.currentTime = 0;
        var played = audio.play();
        if (played && played.catch) {
            played.catch(function (err) {
                console.warn('[ReplaySound] Play failed for ' + name + ':', err.message);
                useFallback = true;
                playFallback(name);
            });
        }
    }

    /**
     * Определяет, какой звук проиграть для данного хода реплея.
     */
    function getSoundForMove(move, moveIndex, moveRecord, myIndex, finalWinner) {
        if (!move || move.type === 'emote') return null;

        var isLastMove = (moveIndex === moveRecord.length - 1);
        var oppIndex = 1 - myIndex;

        // ---- ПРИОРИТЕТ 1: победный звук на последнем ходу ----
        if (isLastMove && finalWinner !== null && finalWinner !== undefined) {
            if (finalWinner === 0) return 'win_wolf';
            if (finalWinner === 1) return 'win_sheep';
        }

        // ---- ПРИОРИТЕТ 2: opponent_spam — только на 4-й стене подряд ----
        if (move.type === 'wall' && move.player === oppIndex) {
            var consecutiveOppWalls = 0;
            for (var i = moveIndex; i >= 0; i--) {
                var m = moveRecord[i];
                if (m.player === oppIndex && m.type === 'wall') {
                    consecutiveOppWalls++;
                } else if (m.player === myIndex) {
                    continue;
                } else {
                    break;
                }
            }
            if (consecutiveOppWalls === 4) return 'opponent_spam';
        }

        // ---- ПРИОРИТЕТ 3: стены ----
        if (move.type === 'wall') {
            if (move.player === myIndex) return 'my_wall';
            if (move.player === oppIndex) return 'opponent_wall';
        }

        // ---- ПРИОРИТЕТ 4: move_start — только один раз за серию без стен ----
        if (move.type === 'move' && move.player === myIndex) {
            // Первый ход нашей фишки в игре
            var ourFirstMove = true;
            for (var j = 0; j < moveIndex; j++) {
                if (moveRecord[j].type === 'move' && moveRecord[j].player === myIndex) {
                    ourFirstMove = false;
                    break;
                }
            }
            if (ourFirstMove) return 'move_start';

            // Считаем серию без стен перед этим ходом
            var ourMoves = 0, oppMoves = 0;
            for (var k = moveIndex - 1; k >= 0; k--) {
                var pm = moveRecord[k];
                if (pm.type === 'wall') break;
                if (pm.type === 'move') {
                    if (pm.player === myIndex) ourMoves++;
                    else oppMoves++;
                }
            }

            // Условие для move_start: ≥3 перемещений с обеих сторон
            if (ourMoves >= 3 && oppMoves >= 3) {
                // Проверяем, был ли уже move_start в этой же серии
                // (т.е. есть ли предыдущий ход нашей фишки, который тоже удовлетворял условию)
                var alreadyHadMoveStart = false;
                for (var k2 = moveIndex - 1; k2 >= 0; k2--) {
                    var pm2 = moveRecord[k2];
                    if (pm2.type === 'wall') break;
                    if (pm2.type === 'move' && pm2.player === myIndex) {
                        // Проверяем, удовлетворял ли pm2 условию на своём месте
                        var ourM3 = 0, oppM3 = 0;
                        for (var k3 = k2 - 1; k3 >= 0; k3--) {
                            var pm3 = moveRecord[k3];
                            if (pm3.type === 'wall') break;
                            if (pm3.type === 'move') {
                                if (pm3.player === myIndex) ourM3++;
                                else oppM3++;
                            }
                        }
                        if (ourM3 >= 3 && oppM3 >= 3) {
                            alreadyHadMoveStart = true;
                        }
                        break; // Проверили только первый предыдущий ход нашей фишки
                    }
                }

                if (!alreadyHadMoveStart) return 'move_start';
            }
        }

        return null;
    }

    window.ReplaySound = {
        init: init,
        play: play,
        getSoundForMove: getSoundForMove,
        getAudioStream: getAudioStream
    };
})();