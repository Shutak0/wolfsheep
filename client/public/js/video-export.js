// video-export.js — MP4 экспорт с точной A/V синхронизацией через WebCodecs + mp4-muxer
(function () {
    var isSupported = (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof window.Mp4Muxer !== 'undefined');

    function log(msg) { console.log('[VideoExport] ' + msg); }
    function warn(msg) { console.warn('[VideoExport] ' + msg); }
    function err(msg) { console.error('[VideoExport] ' + msg); }

    /**
     * Экспортирует реплей в MP4 с идеальной синхронизацией.
     *
     * @param {Object} opts
     *   canvas       — основной canvas с доской (600×600)
     *   vertCanvas   — портретный canvas для видео
     *   moveRecord   — массив ходов
     *   engine       — QuoridorEngine
     *   ui           — QuoridorUI
     *   tc           — time control
     *   myIndex      — индекс игрока
     *   finalWinner  — победитель
     *   finalReason  — причина победы
     *   randomPhrase — текст на видео
     *   onProgress   — (phase, detail) колбэк
     *   onDone       — (blob) колбэк с готовым MP4
     */
    function exportMP4(opts) {
        if (!isSupported) {
            opts.onProgress('error', 'WebCodecs not available');
            opts.onDone(null);
            return;
        }

        var canvas = opts.canvas;
        var vertCanvas = opts.vertCanvas;
        var moveRecord = opts.moveRecord;
        var engine = opts.engine;
        var ui = opts.ui;
        var tc = opts.tc;
        var myIndex = opts.myIndex;
        var finalWinner = opts.finalWinner;
        var finalReason = opts.finalReason;
        var randomPhrase = opts.customPhrase || opts.randomPhrase;
        var speedMultiplier = opts.speedMultiplier || 1;
        if (speedMultiplier < 0.1) speedMultiplier = 0.1;
        if (speedMultiplier > 5) speedMultiplier = 5;

        var vertW = vertCanvas.width, vertH = vertCanvas.height;
        var vctx = vertCanvas.getContext('2d');

        // Preload CTA images
        var gplayImg = null, iconImg = null;
        function loadCTAs() {
            gplayImg = new Image(); gplayImg.src = '/imgs/GPlay.png';
            iconImg = new Image(); iconImg.src = '/imgs/logo-192.png';
        }
        loadCTAs();

        function drawVertFrame(showCTA) {
            vctx.fillStyle = '#000000';
            vctx.fillRect(0, 0, vertW, vertH);
            var boardY = Math.round((vertH - 600) / 2) + 20;
            vctx.drawImage(canvas, 0, boardY);
            var titleY = Math.round(vertH * 0.18);
            vctx.fillStyle = '#ffffff';
            vctx.font = 'bold 46px "Segoe UI", sans-serif';
            vctx.textAlign = 'center';
            vctx.textBaseline = 'middle';
            vctx.shadowColor = '#c084fc';
            vctx.shadowBlur = 30;
            vctx.fillText(randomPhrase, vertW / 2, titleY);
            vctx.shadowBlur = 0;
            // CTA: icons + Wolfsheep in one row, website below, pure black bg, GPlay 56x56, logo-192 40x40 rounded with border
            var ctaTop = boardY + 600, ctaH = vertH - ctaTop, ctaX = Math.round(vertW * 0.2);
            var cy = ctaTop + 16;
            vctx.fillStyle = '#000000';
            vctx.fillRect(0, ctaTop, vertW, ctaH);
            var gplaySz = 56, logoSz = 40, iconGap = 30;
            if (gplayImg && gplayImg.complete && gplayImg.naturalWidth > 0) vctx.drawImage(gplayImg, ctaX, cy, gplaySz, gplaySz);
            if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
                var logoX = ctaX + gplaySz + iconGap, logoY = cy;
                // Border around logo
                vctx.strokeStyle = '#8a2be2'; vctx.lineWidth = 3;
                vctx.beginPath(); vctx.roundRect(logoX - 1, logoY - 1, logoSz + 2, logoSz + 2, logoSz * 0.2); vctx.stroke();
                vctx.save();
                vctx.beginPath(); vctx.roundRect(logoX, logoY, logoSz, logoSz, logoSz * 0.2); vctx.clip();
                vctx.drawImage(iconImg, logoX, logoY, logoSz, logoSz);
                vctx.restore();
            }
            var textX = ctaX + gplaySz + iconGap + logoSz + 12;
            vctx.fillStyle = '#c084fc'; vctx.font = 'bold 40px "Segoe UI", sans-serif'; vctx.textAlign = 'left'; vctx.textBaseline = 'middle';
            vctx.shadowColor = '#c084fc'; vctx.shadowBlur = 20;
            vctx.fillText('Wolfsheep', textX, cy + gplaySz / 2); vctx.shadowBlur = 0;
            cy += gplaySz + 8;
            vctx.fillStyle = '#94a3b8'; vctx.font = '26px "Segoe UI", sans-serif'; vctx.textAlign = 'left'; vctx.textBaseline = 'top';
            vctx.fillText('website: wolfsheep.fun', ctaX, cy);
        }

        // ---------- Шаг 1: рендерим ВСЕ кадры синхронно ----------
        opts.onProgress('render', 'Rendering frames...');

        var FPS = 30; // кодируем при 30 fps
        var frameDuration = Math.round(1e6 / FPS); // микросекунд на кадр
        var videoFrames = [];
        var audioEvents = []; // [{timestampMicros, soundName}]

        // Инициализируем игровое состояние
        var replayState = engine.initState(tc);
        var currentZoom = null;
        var prevState = null;

        var movesOnly = [];
        for (var mi = 0; mi < moveRecord.length; mi++) {
            if (moveRecord[mi].type !== 'emote') movesOnly.push(moveRecord[mi]);
        }

        // Функция рендера игрового состояния на основной canvas
        function renderGameState(rs, pIndex, rActive, zw) {
            var opt = {
                playerIndex: pIndex != null ? pIndex : 0,
                replayMode: rActive
            };
            if (zw && zw.level < 9) {
                opt.zoomLevel = zw.level;
                opt.zoomRow = zw.row;
                opt.zoomCol = zw.col;
            }
            ui.render(canvas, rs, [null, null], null, opt);
        }

        // Функция проверки победного хода
        function isWinningMove(move, rs) {
            if (move.type !== 'move') return null;
            if (move.player === 0 && move.row === rs.players[1].row && move.col === rs.players[1].col) return 0;
            if (move.player === 1 && move.row === 8) return 1;
            return null;
        }

        // Функция вычисления зумов для реплея
        function computeReplayZooms(moves) {
            var N = moves.length;
            if (N === 0) return [];
            function bboxOf(ms) {
                var rMin = 9, rMax = -1, cMin = 9, cMax = -1, hasWall = false;
                for (var j = 0; j < ms.length; j++) {
                    var m = ms[j];
                    if (m.type === 'move') {
                        rMin = Math.min(rMin, m.row); rMax = Math.max(rMax, m.row);
                        cMin = Math.min(cMin, m.col); cMax = Math.max(cMax, m.col);
                    } else if (m.type === 'wall') {
                        hasWall = true;
                        rMin = Math.min(rMin, m.row, m.row + 1); rMax = Math.max(rMax, m.row, m.row + 1);
                        cMin = Math.min(cMin, m.col, m.col + 1); cMax = Math.max(cMax, m.col, m.col + 1);
                    }
                }
                var fits = (rMax - rMin < 6 && cMax - cMin < 6 && rMin <= rMax && cMin <= cMax);
                return { fits: fits, hasWall: hasWall, rMin: rMin, rMax: rMax, cMin: cMin, cMax: cMax };
            }
            var plan = [], consecutiveInZone = 0, lockedRow = null, lockedCol = null, zoomCooldown = 0;
            for (var i = 0; i < N; i++) {
                var lookahead = moves.slice(i, i + 3), cur = bboxOf(lookahead);
                var nextLookahead = (i + 1 < N) ? moves.slice(i + 1, i + 4) : [], nxt = nextLookahead.length > 0 ? bboxOf(nextLookahead) : { fits: false };
                var hasNext = (i + 1 < N), willExit = hasNext && !nxt.fits;
                var entry = { level: 9, row: 0, col: 0 };
                if (zoomCooldown > 0) zoomCooldown--;
                if (i >= 2 && zoomCooldown <= 0 && cur.fits && cur.hasWall && !willExit && lookahead.length >= 3) {
                    if (consecutiveInZone === 0) {
                        var bboxCenterR = (cur.rMin + cur.rMax) / 2, bboxCenterC = (cur.cMin + cur.cMax) / 2;
                        lockedRow = Math.max(0, Math.min(1, Math.round(bboxCenterR - 4)));
                        lockedCol = Math.max(0, Math.min(1, Math.round(bboxCenterC - 4)));
                    }
                    consecutiveInZone++;
                    entry.level = 8; entry.row = lockedRow; entry.col = lockedCol;
                } else {
                    if (consecutiveInZone > 0) zoomCooldown = 2;
                    consecutiveInZone = 0; lockedRow = null; lockedCol = null;
                }
                plan.push(entry);
            }
            return plan;
        }

        function getReplayDelay(moves, mi) {
            var baseDelay, isMoveSeries = false;
            if (mi < 1) {
                baseDelay = 333;
            } else {
                var p = moves[mi].player, opp = 1 - p;
                var ourMoves = 0, ourWalls = 0;
                for (var k = mi; k >= 0; k--) {
                    var mk = moves[k];
                    if (mk.player !== p) break;
                    if (mk.type === 'move') ourMoves++;
                    else if (mk.type === 'wall') ourWalls++;
                }
                var ourMixed = (ourMoves > 0 && ourWalls > 0);
                var oppMoves = 0, oppWalls = 0;
                for (var j = mi - 1; j >= 0; j--) {
                    var mj = moves[j];
                    if (mj.player !== opp) continue;
                    for (var q = j; q >= 0; q--) {
                        var mq = moves[q];
                        if (mq.player !== opp) break;
                        if (mq.type === 'move') oppMoves++;
                        else if (mq.type === 'wall') oppWalls++;
                    }
                    break;
                }
                var oppMixed = (oppMoves > 0 && oppWalls > 0);
                if (!ourMixed && !oppMixed && ourMoves >= 6 && oppMoves >= 6) { baseDelay = 100; isMoveSeries = true; }
                else if (!ourMixed && !oppMixed && ourWalls >= 2 && oppWalls >= 2) baseDelay = 467;
                else if (!ourMixed && !oppMixed && ourMoves >= 2 && oppMoves >= 2) { baseDelay = 200; isMoveSeries = true; }
                else baseDelay = 500;
            }
            var mult;
            if (mi < 6) mult = 2.2;
            else if (isMoveSeries) mult = 2.0;
            else mult = 1.5;
            return Math.round(baseDelay / mult);
        }

        function getSoundForMove(move, moveIndex, myIdx, fWinner) {
            if (!move || move.type === 'emote') return null;
            var isLastMove = (moveIndex === movesOnly.length - 1);
            var oppIndex = 1 - myIdx;
            if (isLastMove && fWinner !== null && fWinner !== undefined) {
                if (fWinner === 0) return 'win_wolf';
                if (fWinner === 1) return 'win_sheep';
            }
            if (move.type === 'wall' && move.player === oppIndex) {
                var consecutiveOppWalls = 0;
                for (var i = moveIndex; i >= 0; i--) {
                    var mm = movesOnly[i];
                    if (mm.player === oppIndex && mm.type === 'wall') consecutiveOppWalls++;
                    else if (mm.player === myIdx) continue;
                    else break;
                }
                if (consecutiveOppWalls === 4) return 'opponent_spam';
            }
            if (move.type === 'wall') {
                if (move.player === myIdx) return 'my_wall';
                if (move.player === oppIndex) return 'opponent_wall';
            }
            if (move.type === 'move' && move.player === myIdx) {
                var ourFirstMove = true;
                for (var j = 0; j < moveIndex; j++) {
                    if (movesOnly[j].type === 'move' && movesOnly[j].player === myIdx) { ourFirstMove = false; break; }
                }
                if (ourFirstMove) return 'move_start';
                var ourM = 0, oppM = 0;
                for (var kk = moveIndex - 1; kk >= 0; kk--) {
                    var pm = movesOnly[kk];
                    if (pm.type === 'wall') break;
                    if (pm.type === 'move') { if (pm.player === myIdx) ourM++; else oppM++; }
                }
                if (ourM >= 3 && oppM >= 3) {
                    var alreadyHad = false;
                    for (var k2 = moveIndex - 1; k2 >= 0; k2--) {
                        var pm2 = movesOnly[k2];
                        if (pm2.type === 'wall') break;
                        if (pm2.type === 'move' && pm2.player === myIdx) {
                            var ourM3 = 0, oppM3 = 0;
                            for (var k3 = k2 - 1; k3 >= 0; k3--) {
                                var pm3 = movesOnly[k3];
                                if (pm3.type === 'wall') break;
                                if (pm3.type === 'move') { if (pm3.player === myIdx) ourM3++; else oppM3++; }
                            }
                            if (ourM3 >= 3 && oppM3 >= 3) alreadyHad = true;
                            break;
                        }
                    }
                    if (!alreadyHad) return 'move_start';
                }
            }
            return null;
        }

        var zoomPlan = computeReplayZooms(movesOnly);
        currentZoom = null;

        renderGameState(replayState, myIndex, true, currentZoom);
        drawVertFrame(false);

        var currentTimeMicros = 0; // текущее время в микросекундах
        var totalSteps = moveRecord.length;

        function addVideoFramesUntil(targetTimeMicros) {
            while (currentTimeMicros < targetTimeMicros && currentTimeMicros <= targetTimeMicros) {
                videoFrames.push({ canvas: canvas, vertCanvas: vertCanvas, timestamp: currentTimeMicros });
                currentTimeMicros += frameDuration;
            }
        }

        // Проходим реплей пошагово
        var soundIdx = 0;
        var finalWinnerAdjusted = finalWinner;

        function advanceOneStep(idx) {
            if (idx >= totalSteps) return;
            var move = moveRecord[idx];

            if (move.type !== 'emote') {
                engine.applyAction(replayState, move);
                var wp = isWinningMove(move, replayState);
                if (wp !== null) {
                    replayState.gameOver = true;
                    replayState.winner = wp;
                    replayState.winReason = 'target';
                    finalWinnerAdjusted = wp;
                } else {
                    engine.endTurn(replayState);
                    replayState.gameOver = false;
                }

                // Запоминаем звук с текущим таймстемпом
                var snd = getSoundForMove(movesOnly[soundIdx], soundIdx, myIndex, finalWinnerAdjusted);
                if (snd) {
                    audioEvents.push({ timestampMicros: currentTimeMicros, soundName: snd });
                }
                soundIdx++;
            }

            if (zoomPlan.length > (soundIdx > 0 ? soundIdx - 1 : 0)) {
                currentZoom = zoomPlan[soundIdx > 0 ? soundIdx - 1 : 0];
            }

            renderGameState(replayState, myIndex, true, currentZoom);
            drawVertFrame(false);

            // Захватываем кадры (продолжительность шага)
            var stepEndTimeMicros;
            if (idx < totalSteps - 1) {
                var delayMs = getReplayDelay(movesOnly, soundIdx > 0 ? soundIdx - 1 : 0) / speedMultiplier;
                stepEndTimeMicros = currentTimeMicros + Math.max(delayMs * 1000, frameDuration);
            } else {
                stepEndTimeMicros = currentTimeMicros + frameDuration; // минимум 1 кадр
            }

            addVideoFramesUntil(stepEndTimeMicros);
            currentTimeMicros = stepEndTimeMicros;
        }

        for (var step = 0; step < totalSteps; step++) {
            advanceOneStep(step);
        }

        // Финальный кадр с CTA
        replayState.gameOver = true;
        replayState.winner = finalWinnerAdjusted;
        replayState.winReason = finalReason;
        renderGameState(replayState, myIndex, true, null);
        drawVertFrame(true);

        // Добавляем 1.5 секунды финального кадра
        var finalDuration = 1500 * 1000; // 1.5s в микросекундах
        addVideoFramesUntil(currentTimeMicros + finalDuration);

        opts.onProgress('render', 'Rendered ' + videoFrames.length + ' frames, ' + audioEvents.length + ' audio events');

        // ---------- Шаг 2: кодируем видео ----------
        var TARGET_FPS = 30;
        var VIDEO_MICROS = Math.round(1e6 / TARGET_FPS);

        // Проверяем поддержку AVC (H.264)
        var videoConfig = {
            codec: 'avc1.42001f', // H.264 Baseline Level 3.1
            width: vertW,
            height: vertH,
            bitrate: 8000000,
            framerate: TARGET_FPS
        };

        var target = new window.Mp4Muxer.ArrayBufferTarget();
        muxer = new window.Mp4Muxer.Muxer({
            target: target,
            video: { codec: 'avc', width: vertW, height: vertH },
            audio: { codec: 'opus', numberOfChannels: 2, sampleRate: 48000 },
            fastStart: false
        });

        var encodedVideoChunks = [];
        var videoDone = false;
        var encodedAudioChunks = [];
        var audioDone = false;

        function finalizeMuxer() {
            if (!videoDone || !audioDone) return;
            opts.onProgress('mux', 'Finalizing MP4...');
            for (var v = 0; v < encodedVideoChunks.length; v++) {
                muxer.addVideoChunkRaw(
                    new Uint8Array(encodedVideoChunks[v].data),
                    encodedVideoChunks[v].type,
                    encodedVideoChunks[v].timestamp,
                    encodedVideoChunks[v].duration
                );
            }
            for (var a = 0; a < encodedAudioChunks.length; a++) {
                muxer.addAudioChunkRaw(
                    new Uint8Array(encodedAudioChunks[a].data),
                    'key',
                    encodedAudioChunks[a].timestamp,
                    encodedAudioChunks[a].duration
                );
            }
            muxer.finalize();
            opts.onProgress('done', 'MP4 ready!');
            opts.onDone(new Blob([target.buffer], { type: 'video/mp4' }));
        }

        // Пытаемся использовать VideoEncoder; если не поддерживается (напр. AVC не доступен), возвращаем null
        var videoEncoderSupported = false;
        try {
            VideoEncoder.isConfigSupported(videoConfig).then(function (res) {
                if (res && res.supported) {
                    videoEncoderSupported = true;
                    encodeVideo();
                } else {
                    videoConfig.codec = 'avc1.4d001f'; // Main profile
                    VideoEncoder.isConfigSupported(videoConfig).then(function (r2) {
                        if (r2 && r2.supported) {
                            videoEncoderSupported = true;
                            encodeVideo();
                        } else {
                            opts.onProgress('error', 'AVC/H.264 encoding not supported');
                            opts.onDone(null);
                        }
                    });
                }
            });
        } catch (e) {
            opts.onProgress('error', 'VideoEncoder not available: ' + e.message);
            opts.onDone(null);
        }

        function encodeVideo() {
            if (!videoEncoderSupported) return;
            opts.onProgress('encode', 'Encoding video...');
            var encoder = new VideoEncoder({
                output: function (chunk, meta) {
                    var buf = new ArrayBuffer(chunk.byteLength);
                    chunk.copyTo(buf);
                    encodedVideoChunks.push({
                        data: buf,
                        type: chunk.type,
                        timestamp: chunk.timestamp,
                        duration: chunk.duration
                    });
                },
                error: function (e) {
                    err('Video encode error: ' + e.message);
                    opts.onProgress('error', 'Video encoding failed');
                    opts.onDone(null);
                }
            });

            encoder.configure(videoConfig);

            var encoded = 0;
            function encodeNextFrame(i) {
                if (i >= videoFrames.length) {
                    encoder.flush().then(function () {
                        encoder.close();
                        videoDone = true;
                        opts.onProgress('encode', 'Video encoded: ' + encodedVideoChunks.length + ' chunks');
                        finalizeMuxer();
                    });
                    return;
                }
                var vf = videoFrames[i];
                // Рендерим кадр на vertCanvas с сохранённым состоянием canvas
                drawVertFrameFromSaved(vf, i);
                var frame = new VideoFrame(vertCanvas, { timestamp: i * VIDEO_MICROS, duration: VIDEO_MICROS });
                encoder.encode(frame, { keyFrame: i === 0 });
                frame.close();
                encoded++;

                if (i % 30 === 0) {
                    opts.onProgress('encode', 'Video: ' + encoded + '/' + videoFrames.length);
                }

                setTimeout(function () { encodeNextFrame(i + 1); }, 0);
            }

            encodeNextFrame(0);
        }

        function drawVertFrameFromSaved(vf, idx) {
            var canvasRef = vf.canvas;
            var vertCanvasRef = vf.vertCanvas;
            var cta = (idx >= videoFrames.length - Math.round(1500 / (1000 / TARGET_FPS)));
            // Копируем состояние основного canvas на vertCanvas и рендерим drawVertFrame
            var mainCtx = canvasRef.getContext('2d');
            var tempData = mainCtx.getImageData(0, 0, 600, 600);
            // Сохраняем неповреждённый canvas для CTA
            var savedCanvasImg = new Image();
            savedCanvasImg.src = canvasRef.toDataURL();
            // Рендерим стандартным способом (проще переиспользовать drawVertFrame)
            var vctx2 = vertCanvasRef.getContext('2d');
            vctx2.fillStyle = '#000000';
            vctx2.fillRect(0, 0, vertW, vertH);
            var boardY = Math.round((vertH - 600) / 2) + 20;
            vctx2.drawImage(canvasRef, 0, boardY);
            var titleY = Math.round(vertH * 0.18);
            vctx2.fillStyle = '#ffffff';
            vctx2.font = 'bold 46px "Segoe UI", sans-serif';
            vctx2.textAlign = 'center';
            vctx2.textBaseline = 'middle';
            vctx2.shadowColor = '#c084fc';
            vctx2.shadowBlur = 30;
            vctx2.fillText(randomPhrase, vertW / 2, titleY);
            vctx2.shadowBlur = 0;
            // CTA section (matching drawVertFrame)
            if (cta) {
                var ctaTop = boardY + 600;
                var ctaH = vertH - ctaTop;
                vctx2.fillStyle = 'rgba(13,13,26,0.95)';
                vctx2.fillRect(0, ctaTop, vertW, ctaH);
                var cy = ctaTop + 30;
                vctx2.fillStyle = '#94a3b8';
                vctx2.font = '14px "Segoe UI", sans-serif';
                vctx2.textAlign = 'center';
                vctx2.textBaseline = 'top';
                vctx2.fillText('Get it on:', vertW / 2, cy);
                cy += 22;
                var iconSize = 40, iconGap = 12;
                var totalIW = iconSize * 2 + iconGap;
                var iconStartX = (vertW - totalIW) / 2;
                if (gplayImg && gplayImg.complete && gplayImg.naturalWidth > 0) {
                    vctx2.drawImage(gplayImg, iconStartX, cy, iconSize, iconSize);
                }
                if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
                    vctx2.drawImage(iconImg, iconStartX + iconSize + iconGap, cy, iconSize, iconSize);
                }
                cy += iconSize + 12;
                vctx2.fillStyle = '#c084fc';
                vctx2.font = 'bold 20px "Segoe UI", sans-serif';
                vctx2.textAlign = 'center';
                vctx2.textBaseline = 'top';
                vctx2.shadowColor = '#c084fc';
                vctx2.shadowBlur = 15;
                vctx2.fillText('Wolfsheep', vertW / 2, cy);
                vctx2.shadowBlur = 0;
                cy += 26;
                vctx2.fillStyle = '#94a3b8';
                vctx2.font = '13px "Segoe UI", sans-serif';
                vctx2.textAlign = 'center';
                vctx2.textBaseline = 'top';
                vctx2.fillText('website: wolfsheep.fun', vertW / 2, cy);
            }
        }

        // ---------- Шаг 3: синтезируем аудио через OfflineAudioContext ----------
        function encodeAudio() {
            opts.onProgress('audio', 'Synthesizing audio...');
            var sampleRate = 48000;
            var offlineCtx = new OfflineAudioContext(2, sampleRate * 1, sampleRate);

            // Ищем победные звуки чтобы знать продолжительность
            var totalDurationSec = currentTimeMicros / 1e6 + 1.5; // +1.5s финального кадра
            offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDurationSec), sampleRate);

            // Синтезируем звуки
            var soundsCreated = 0;
            audioEvents.forEach(function (evt) {
                var tSec = evt.timestampMicros / 1e6;
                synthAudioEvent(offlineCtx, evt.soundName, tSec, sampleRate);
                soundsCreated++;
            });

            opts.onProgress('audio', 'Rendering audio (' + soundsCreated + ' events)...');

            offlineCtx.startRendering().then(function (renderedBuffer) {
                opts.onProgress('audio', 'Audio rendered, encoding...');
                encodeAudioBuffer(renderedBuffer, sampleRate);
            }).catch(function (e) {
                err('Audio render error: ' + e.message);
                // Продолжаем без аудио
                audioDone = true;
                finalizeMuxer();
            });
        }

        function synthAudioEvent(ctx, soundName, startTimeSec, sampleRate) {
            var now = startTimeSec;
            switch (soundName) {
                case 'move_start': {
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.linearRampToValueAtTime(900, now + 0.15);
                    gain.gain.setValueAtTime(0.12, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.start(now); osc.stop(now + 0.15);
                    break;
                }
                case 'my_wall': {
                    synthNoise(ctx, now, 0.2, 0.1, 800, sampleRate);
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(200, now);
                    gain.gain.setValueAtTime(0.08, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.start(now); osc.stop(now + 0.15);
                    break;
                }
                case 'opponent_wall': {
                    synthNoise(ctx, now, 0.2, 0.08, 700, sampleRate);
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(180, now);
                    gain.gain.setValueAtTime(0.06, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.start(now); osc.stop(now + 0.12);
                    break;
                }
                case 'opponent_spam': {
                    for (var i = 0; i < 3; i++) {
                        var osc = ctx.createOscillator();
                        var gain = ctx.createGain();
                        osc.type = 'sawtooth';
                        osc.frequency.setValueAtTime(300 + i * 100, now + i * 0.1);
                        gain.gain.setValueAtTime(0.1, now + i * 0.1);
                        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.1);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.1);
                    }
                    synthNoise(ctx, now, 0.3, 0.12, 600, sampleRate);
                    break;
                }
                case 'win_sheep': {
                    var o1 = ctx.createOscillator(), g1 = ctx.createGain();
                    o1.type = 'square'; o1.frequency.setValueAtTime(523, now); o1.frequency.linearRampToValueAtTime(659, now + 0.15);
                    g1.gain.setValueAtTime(0.15, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    o1.connect(g1); g1.connect(ctx.destination); o1.start(now); o1.stop(now + 0.15);
                    var o2 = ctx.createOscillator(), g2 = ctx.createGain();
                    o2.type = 'square'; o2.frequency.setValueAtTime(659, now + 0.15); o2.frequency.linearRampToValueAtTime(784, now + 0.3);
                    g2.gain.setValueAtTime(0.15, now + 0.15); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                    o2.connect(g2); g2.connect(ctx.destination); o2.start(now + 0.15); o2.stop(now + 0.3);
                    var o3 = ctx.createOscillator(), g3 = ctx.createGain();
                    o3.type = 'square'; o3.frequency.setValueAtTime(784, now + 0.3);
                    g3.gain.setValueAtTime(0.18, now + 0.3); g3.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                    o3.connect(g3); g3.connect(ctx.destination); o3.start(now + 0.3); o3.stop(now + 0.6);
                    break;
                }
                case 'win_wolf': {
                    var o1 = ctx.createOscillator(), g1 = ctx.createGain();
                    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(200, now); o1.frequency.linearRampToValueAtTime(150, now + 0.2);
                    g1.gain.setValueAtTime(0.12, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                    o1.connect(g1); g1.connect(ctx.destination); o1.start(now); o1.stop(now + 0.2);
                    var o2 = ctx.createOscillator(), g2 = ctx.createGain();
                    o2.type = 'sawtooth'; o2.frequency.setValueAtTime(150, now + 0.2);
                    g2.gain.setValueAtTime(0.14, now + 0.2); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                    o2.connect(g2); g2.connect(ctx.destination); o2.start(now + 0.2); o2.stop(now + 0.5);
                    synthNoise(ctx, now, 0.4, 0.06, 400, sampleRate);
                    break;
                }
            }
        }

        function synthNoise(ctx, startTime, duration, vol, freq, sampleRate) {
            var bufferSize = Math.floor(sampleRate * duration);
            var buffer = ctx.createBuffer(1, bufferSize, sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            var source = ctx.createBufferSource();
            var gain = ctx.createGain();
            var filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = freq;
            filter.Q.value = 0.8;
            source.buffer = buffer;
            gain.gain.setValueAtTime(vol, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            source.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            source.start(startTime);
            source.stop(startTime + duration);
        }

        function encodeAudioBuffer(audioBuffer, sampleRate) {
            var numChannels = audioBuffer.numberOfChannels;
            var length = audioBuffer.length;

            // Подготавливаем AudioEncoder
            AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: sampleRate, numberOfChannels: Math.min(numChannels, 2) }).then(function (res) {
                if (!res || !res.supported) {
                    warn('Opus encoding not supported — skipping audio');
                    audioDone = true;
                    finalizeMuxer();
                    return;
                }

                var enc = new AudioEncoder({
                    output: function (chunk, meta) {
                        var buf = new ArrayBuffer(chunk.byteLength);
                        chunk.copyTo(buf);
                        encodedAudioChunks.push({
                            data: buf,
                            type: chunk.type,
                            timestamp: chunk.timestamp,
                            duration: chunk.duration
                        });
                    },
                    error: function (e) {
                        err('Audio encode error: ' + e.message);
                        audioDone = true;
                        finalizeMuxer();
                    }
                });

                // Объединяем каналы если нужно
                var channels = Math.min(numChannels, 2);
                var bufData = [];
                if (channels === 1) {
                    bufData = [audioBuffer.getChannelData(0)];
                } else {
                    bufData = [audioBuffer.getChannelData(0), audioBuffer.getChannelData(1)];
                }

                enc.configure({ codec: 'opus', sampleRate: sampleRate, numberOfChannels: channels, bitrate: 128000 });

                // Кодируем весь буфер одним чанком
                var audioData = new AudioData({
                    format: 'f32-planar',
                    sampleRate: sampleRate,
                    numberOfFrames: length,
                    numberOfChannels: channels,
                    timestamp: 0,
                    data: bufData
                });

                enc.encode(audioData);
                audioData.close();

                enc.flush().then(function () {
                    enc.close();
                    audioDone = true;
                    opts.onProgress('audio', 'Audio encoded: ' + encodedAudioChunks.length + ' chunks');
                    finalizeMuxer();
                });
            });
        }

        // Запускаем кодирование аудио (это асинхронно)
        encodeAudio();
    }

    window.VideoExport = { exportMP4: exportMP4 };
})();