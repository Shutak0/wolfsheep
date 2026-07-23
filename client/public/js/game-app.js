// game-app.js — игровая страница WolfSheep
(function () {
    var __ = window.__ || function(k){return k;};
    var canvas = document.getElementById('board');
    var turnBadge = document.getElementById('turn-badge');
    var statusMsg = document.getElementById('status-msg');
    var resetBtn = document.getElementById('resetBtn');
    var surrenderBtn = document.getElementById('surrenderBtn');
    var waitingOverlay = document.getElementById('waiting-overlay');
    var waitRoomId = document.getElementById('wait-room-id');
    var tcBadge = document.getElementById('tc-badge');
    var myBlock = document.getElementById('my-block'), opBlock = document.getElementById('op-block');
    var playAgainBtn = document.getElementById('playAgainBtn'), recBtn = document.getElementById('recBtn');
    var downloadVidBtn = document.getElementById('downloadVidBtn');
    var myDot = document.getElementById('my-dot'), opDot = document.getElementById('op-dot');
    var myName = document.getElementById('my-name'), opName = document.getElementById('op-name');
    var myElo = document.getElementById('my-elo'), opElo = document.getElementById('op-elo');
    var myWalls = document.getElementById('my-walls'), opWalls = document.getElementById('op-walls');
    var myTimeEl = document.getElementById('my-time'), opTimeEl = document.getElementById('op-time');
    var myTimeText = document.getElementById('my-time-text'), opTimeText = document.getElementById('op-time-text');

    var Engine = window.QuoridorEngine, UI = window.QuoridorUI;
    var isChallengeRoom = false, rematchReady = false;
    var state = null, playerImages = [null, null], hoverWall = null;
    var moveRecord = [], prevState = null, pendingState = null, replayTimer = null, replayActive = false;
    var winAnimTimer = null, winStartTime = 0;
    var network = new QuoridorNetwork();
    var myIndex = null, gameStarted = false;
    var DOT_CLASSES = ['p1', 'p2'];
    var emoteCooldown = 0;
    var wallMode = null;
    var wallDrag = null;

    function isMobile() {
        var bar = document.getElementById('wall-mode-bar');
        if (!bar) return false;
        return window.getComputedStyle(bar).display !== 'none';
    }

    function vibrate(pattern) {
        if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch(e) {} }
    }
    var lastTapTime = 0, tapPosition = null;
    function handleDoubleTap(e) {
        var now = Date.now();
        var pos = UI.getBoardPos(canvas, e.clientX, e.clientY, myIndex != null ? myIndex : 0);
        if (!pos) return false;
        if (now - lastTapTime < 350 && tapPosition &&
            Math.abs(tapPosition.x - pos.x) < 20 && Math.abs(tapPosition.y - pos.y) < 20) {
            lastTapTime = 0; tapPosition = null; return true;
        }
        lastTapTime = now; tapPosition = pos; return false;
    }
    var longPressTimer = null, longPressPos = null;
    function preloadDefaultImages() { var wolfImg=new Image();wolfImg.onload=function(){playerImages[0]=wolfImg;render();};wolfImg.src='/imgs/Wolf.png';var sheepImg=new Image();sheepImg.onload=function(){playerImages[1]=sheepImg;render();};sheepImg.src='/imgs/Sheep.png'; }
    var tcName = sessionStorage.getItem('ws_tc') || '1+5';
    var playerName = sessionStorage.getItem('ws_name') || 'Player';
    var playerColor = sessionStorage.getItem('ws_color') || 'auto';
    var userId = sessionStorage.getItem('ws_userId') ? parseInt(sessionStorage.getItem('ws_userId')) : null;
    var tc = Engine.TIME_PRESETS[tcName] || Engine.TIME_PRESETS['1+5'];
    state = Engine.initState(tc); tcBadge.textContent = tcName;
    function formatTime(ms) { if (ms < 0) ms = 0; var s = Math.ceil(ms / 1000); return Math.floor(s/60)+':'+(s%60).toString().padStart(2,'0'); }
    function updateTimeDisplay() {
        if (!state || myIndex === null) return;
        var mt=state.players[myIndex].timeLeft,ot=state.players[1-myIndex].timeLeft;
        myTimeText.textContent=formatTime(mt);opTimeText.textContent=formatTime(ot);
        [myTimeEl,opTimeEl].forEach(function(e){e.classList.remove('warning','danger');});
        if(mt<=10000)myTimeEl.classList.add('danger');else if(mt<=20000)myTimeEl.classList.add('warning');
        if(ot<=10000)opTimeEl.classList.add('danger');else if(ot<=20000)opTimeEl.classList.add('warning');
        myTimeEl.style.borderColor=state.turn===myIndex?(mt<=10000?'#ff3366':mt<=20000?'#ffaa00':'#c084fc'):'#2a1a5a';
        opTimeEl.style.borderColor=state.turn===(1-myIndex)?(ot<=10000?'#ff3366':ot<=20000?'#ffaa00':'#c084fc'):'#2a1a5a';
    }
    function updateUI() {
        if(!state||myIndex===null)return;
        if(myIndex===0){myWalls.textContent=state.players[0].walls;opWalls.textContent=state.players[1].walls;}
        else{myWalls.textContent=state.players[1].walls;opWalls.textContent=state.players[0].walls;}
        myBlock.classList.toggle('active',state.turn===myIndex&&!state.gameOver&&gameStarted);
        opBlock.classList.toggle('active',state.turn===(1-myIndex)&&!state.gameOver&&gameStarted);
        if(state.gameOver){
            var rt=getReason(state.winReason);
            if(state.winner!==null&&state.winner!==undefined){turnBadge.textContent='🏆 '+UI.COLOR_NAMES[state.winner]+' '+__('game_win_target');if(rt)turnBadge.textContent+=' '+rt;}
            else{turnBadge.textContent='🤝 '+__('game_draw')+(rt?' '+rt:'');}
            if(!replayActive){surrenderBtn.style.display='none';recBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';}
        }else{turnBadge.textContent='⬤ '+UI.COLOR_NAMES[state.turn]+'\'s turn';turnBadge.style.color=UI.COLORS[state.turn];turnBadge.style.textShadow='0 0 20px '+UI.COLORS[state.turn];}
        updateTimeDisplay();
    }
    function diffMove(oldS,newS){
        if(!oldS||!newS)return null;
        var ow=(oldS.walls&&Array.isArray(oldS.walls))?oldS.walls.length:0,nw=(newS.walls&&Array.isArray(newS.walls))?newS.walls.length:0;
        if(nw>ow){var w=newS.walls[nw-1];return{type:'wall',player:oldS.turn,row:w.row,col:w.col,orient:w.orient};}
        for(var p=0;p<2;p++){if(oldS.players[p].row!==newS.players[p].row||oldS.players[p].col!==newS.players[p].col)return{type:'move',player:oldS.turn,row:newS.players[p].row,col:newS.players[p].col};}
        return null;
    }
    function getReason(r){switch(r){case'timeout':return__('game_win_timeout');case'surrender':return__('game_win_surrender');case'disconnect':return__('game_win_disconnect');case'repetition':return__('game_draw_repetition');default:return'';}}
    var currentZoom=null;
    function render(){var opt={playerIndex:myIndex!=null?myIndex:0,replayMode:replayActive};if(currentZoom&&currentZoom.level<9){opt.zoomLevel=currentZoom.level;opt.zoomRow=currentZoom.row;opt.zoomCol=currentZoom.col;}UI.render(canvas,state,playerImages,hoverWall,opt);updateUI();}
    function setStatus(msg,isWin){statusMsg.textContent=msg;statusMsg.className=isWin?'win':'';}
    function showReplayCTA(){var boardWrapper=document.getElementById('board-wrapper'),overlay=document.getElementById('replay-cta');if(!overlay){overlay=document.createElement('div');overlay.id='replay-cta';overlay.className='replay-cta-overlay';overlay.innerHTML='<div class="replay-cta-text">Play on wolfsheep.fun</div>';boardWrapper.appendChild(overlay);}overlay.classList.remove('show');void overlay.offsetWidth;overlay.classList.add('show');}
    function startWinAnimation(onDone){if(winAnimTimer)clearInterval(winAnimTimer);state._winTime=0;winStartTime=Date.now();winAnimTimer=setInterval(function(){if(!state.gameOver){clearInterval(winAnimTimer);winAnimTimer=null;if(onDone)onDone();return;}state._winTime=Date.now()-winStartTime;render();if(state._winTime>=1200){clearInterval(winAnimTimer);winAnimTimer=null;state._winTime=9999;render();if(onDone)onDone();}},30);}
    function isWinningMove(move,rs){if(move.type!=='move')return null;if(move.player===0&&move.row===rs.players[1].row&&move.col===rs.players[1].col)return 0;if(move.player===1&&move.row===8)return 1;return null;}
    function handleGameOver(s){if(!s||!s.gameOver||s.winner===null||s.winner===undefined)return false;startWinAnimation();surrenderBtn.style.display='none';recBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';return true;}

    network.onRoomCreated=function(d){waitingOverlay.classList.add('show');waitRoomId.textContent='ID: '+d.roomId;setStatus(__('game_room_created'),false);};
    network.onRoomJoined=function(d){setStatus(__('game_joined'),false);waitingOverlay.classList.remove('show');};
    network.onPlayerAssigned=function(d){myIndex=d.playerIndex;isChallengeRoom=!!d.isChallenge;rematchReady=false;playAgainBtn.textContent='🔄 '+__('play_again');playAgainBtn.disabled=false;playAgainBtn.style.background='';playAgainBtn.style.color='';surrenderBtn.style.display='inline-block';surrenderBtn.disabled=false;recBtn.style.display='none';downloadVidBtn.style.display='none';playAgainBtn.style.display='none';var mc=d.color==='red'?0:1,oc=1-mc;updateNamesAndElo(d);myDot.className='dot '+DOT_CLASSES[mc];opDot.className='dot '+DOT_CLASSES[oc];var myAnimal=d.color==='red'?'Wolf':'Sheep',opAnimal=d.color==='red'?'Sheep':'Wolf';myDot.innerHTML='<img src="/imgs/'+myAnimal+'.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';opDot.innerHTML='<img src="/imgs/'+opAnimal+'.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';if(d.timeControl)tcBadge.textContent=d.timeControl;moveRecord=[];prevState=null;pendingState=null;};
    network.onGameStarted=function(){if(myIndex===null)return;gameStarted=true;if(pendingState){prevState=pendingState;pendingState=null;}waitingOverlay.classList.remove('show');setStatus(__('game_started'),false);hoverWall=null;render();};
    network.onGameState=function(newState){if(replayActive)return;if(!gameStarted){if(pendingState){var pm2=diffMove(pendingState,newState);if(pm2)moveRecord.push(pm2);}pendingState=Engine.deepClone(newState);state=newState;handleGameOver(newState);render();return;}if(!prevState){if(pendingState){prevState=pendingState;pendingState=null;}else{prevState=Engine.deepClone(newState);}state=newState;handleGameOver(newState);render();return;}var m2=diffMove(prevState,newState);if(m2)moveRecord.push(m2);state=newState;prevState=Engine.deepClone(newState);handleGameOver(newState);render();};
    network.onGameOver=function(data){if(replayActive)return;state.gameOver=true;state.winner=data.winner;state.winReason=data.winReason||'target';surrenderBtn.style.display='none';recBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';if(state.winner!==null&&state.winner!==undefined)startWinAnimation();render();setStatus('🏆 '+data.winnerName+' '+__('game_win_target')+' '+getReason(state.winReason),true);};
    network.onError=function(msg){setStatus(__('game_error')+msg,false);};
    network.onOpponentDisconnected=function(){setStatus(__('game_opponent_left'),true);state.gameOver=true;surrenderBtn.style.display='none';recBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';render();};
    network.onEmote=function(d){if(!replayActive)moveRecord.push({type:'emote',emoteId:d.emoteId,fromPlayer:d.fromPlayer});playEmoteAnim(d.emoteId,d.fromPlayer);};
    network.onRematchReady=function(d){if(d.playerIndex!==myIndex){setStatus('🔄 Opponent wants a rematch!',false);if(!rematchReady){playAgainBtn.textContent='🔄 Accept Rematch';playAgainBtn.style.background='#33ff66';playAgainBtn.style.color='#0a0a1a';}}if(d.playersReady>=2)setStatus('⚡ Rematch starting!',false);};

    surrenderBtn.addEventListener('click',function(){if(gameStarted&&!state.gameOver){vibrate([30,60,30]);network.surrender();}});surrenderBtn.textContent=__('game_surrender');
    resetBtn.textContent=__('game_leave');resetBtn.addEventListener('click',function(){if(replayTimer)clearInterval(replayTimer);if(winAnimTimer)clearInterval(winAnimTimer);replayActive=false;window.location.href='/';});
    playAgainBtn.textContent='🔄 '+__('play_again');playAgainBtn.addEventListener('click',function(){if(isChallengeRoom&&!rematchReady){rematchReady=true;playAgainBtn.textContent='⏳ Waiting for opponent…';playAgainBtn.disabled=true;network.requestRematch();}else{window.location.reload();}});
    recBtn.textContent='▶️ Replay';
    downloadVidBtn.textContent='📥 Download Video';
    var REPLAY_PHRASES=["That's how I won","He didn't expect that","Too easy","Outplayed","Wall trap master","Sheep escaped!","No escape from the Wolf","Calculated moves","Unstoppable","Watch this comeback","EZ win","Best play of the day","You can't stop me","Next level strategy","That ending though!"];
    function computeReplayZooms(movesOnly){var N=movesOnly.length;if(N===0)return[];function bboxOf(moves){var rMin=9,rMax=-1,cMin=9,cMax=-1,hasWall=false;for(var j=0;j<moves.length;j++){var m=moves[j];if(m.type==='move'){rMin=Math.min(rMin,m.row);rMax=Math.max(rMax,m.row);cMin=Math.min(cMin,m.col);cMax=Math.max(cMax,m.col);}else if(m.type==='wall'){hasWall=true;rMin=Math.min(rMin,m.row,m.row+1);rMax=Math.max(rMax,m.row,m.row+1);cMin=Math.min(cMin,m.col,m.col+1);cMax=Math.max(cMax,m.col,m.col+1);}}var fits=(rMax-rMin<6&&cMax-cMin<6&&rMin<=rMax&&cMin<=cMax);return{fits:fits,hasWall:hasWall,rMin:rMin,rMax:rMax,cMin:cMin,cMax:cMax};}var plan=[],consecutiveInZone=0,lockedRow=null,lockedCol=null,zoomCooldown=0;for(var i=0;i<N;i++){var lookahead=movesOnly.slice(i,i+3),cur=bboxOf(lookahead);var nextLookahead=(i+1<N)?movesOnly.slice(i+1,i+4):[],nxt=nextLookahead.length>0?bboxOf(nextLookahead):{fits:false};var hasNext=(i+1<N),willExit=hasNext&&!nxt.fits;var entry={level:9,row:0,col:0};if(zoomCooldown>0)zoomCooldown--;if(i>=2&&zoomCooldown<=0&&cur.fits&&cur.hasWall&&!willExit&&lookahead.length>=3){if(consecutiveInZone===0){var bboxCenterR=(cur.rMin+cur.rMax)/2,bboxCenterC=(cur.cMin+cur.cMax)/2;lockedRow=Math.max(0,Math.min(1,Math.round(bboxCenterR-4)));lockedCol=Math.max(0,Math.min(1,Math.round(bboxCenterC-4)));}consecutiveInZone++;entry.level=8;entry.row=lockedRow;entry.col=lockedCol;}else{if(consecutiveInZone>0)zoomCooldown=2;consecutiveInZone=0;lockedRow=null;lockedCol=null;}plan.push(entry);}return plan;}
    function getReplayDelay(moves,mi){var baseDelay;var isMoveSeries=false;if(mi<1){baseDelay=333;}else{var p=moves[mi].player,opp=1-p;var ourMoves=0,ourWalls=0;for(var k=mi;k>=0;k--){var mk=moves[k];if(mk.player!==p)break;if(mk.type==='move')ourMoves++;else if(mk.type==='wall')ourWalls++;}var ourMixed=(ourMoves>0&&ourWalls>0);var oppMoves=0,oppWalls=0;for(var j=mi-1;j>=0;j--){var mj=moves[j];if(mj.player!==opp)continue;for(var q=j;q>=0;q--){var mq=moves[q];if(mq.player!==opp)break;if(mq.type==='move')oppMoves++;else if(mq.type==='wall')oppWalls++;}break;}var oppMixed=(oppMoves>0&&oppWalls>0);if(!ourMixed&&!oppMixed&&ourMoves>=6&&oppMoves>=6){baseDelay=100;isMoveSeries=true;}else if(!ourMixed&&!oppMixed&&ourWalls>=2&&oppWalls>=2)baseDelay=467;else if(!ourMixed&&!oppMixed&&ourMoves>=2&&oppMoves>=2){baseDelay=200;isMoveSeries=true;}else baseDelay=500;}var mult;if(mi<6)mult=2.2;else if(isMoveSeries)mult=2.0;else mult=1.5;return Math.round(baseDelay/mult);}

    // ---- Export settings UI ----
    var exportSpeedInput=document.getElementById('export-speed'),exportSpeedVal=document.getElementById('speed-val');
    var exportPhraseInput=document.getElementById('export-phrase'),exportSettings=document.getElementById('export-settings');
    var exportStartBtn=document.getElementById('export-start'),exportCancelBtn=document.getElementById('export-cancel');
    downloadVidBtn.addEventListener('click',function(e){
        e.stopPropagation();
        if(exportSettings)exportSettings.style.display='flex';
    });
    if(exportSpeedInput&&exportSpeedVal){
        exportSpeedInput.addEventListener('input',function(){exportSpeedVal.textContent=(exportSpeedInput.value/10).toFixed(1)+'x';});
    }
    if(exportCancelBtn)exportCancelBtn.addEventListener('click',function(){if(exportSettings)exportSettings.style.display='none';});
    if(exportStartBtn)exportStartBtn.addEventListener('click',function(){
        var speed=(exportSpeedInput?exportSpeedInput.value/10:1);
        var customPhrase=(exportPhraseInput&&exportPhraseInput.value.trim())?exportPhraseInput.value.trim():null;
        doExportVideo(speed,customPhrase);
    });
    function doExportVideo(speedMultiplier,customPhrase){
        if(replayActive||!state.gameOver||state.winner===null)return;
        if(winAnimTimer){clearInterval(winAnimTimer);winAnimTimer=null;}
        if(exportSettings)exportSettings.style.display='none';
        var savedState=state;
        downloadVidBtn.style.display='none';recBtn.style.display='none';playAgainBtn.style.display='none';surrenderBtn.style.display='none';resetBtn.style.display='none';
        var randomPhrase=customPhrase||REPLAY_PHRASES[Math.floor(Math.random()*REPLAY_PHRASES.length)];
        var vertW=600,vertH=1067,vertCanvas=document.createElement('canvas');
        vertCanvas.width=vertW;vertCanvas.height=vertH;

        function restoreUI(){
            state=savedState;render();
            recBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';
            resetBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';
        }

        function fallbackWebMExport(){
            var gplayImg=new Image();gplayImg.src='/imgs/GPlay.png';
            var iconImg=new Image();iconImg.src='/imgs/logo-192.png';
            var drawVert = function(){
                var vctx=vertCanvas.getContext('2d');
                vctx.fillStyle='#000000';vctx.fillRect(0,0,vertW,vertH);
                var bY=Math.round((vertH-600)/2)+20;
                vctx.drawImage(canvas,0,bY);
                var tY=Math.round(vertH*0.18);
                vctx.fillStyle='#ffffff';vctx.font='bold 46px "Segoe UI", sans-serif';
                vctx.textAlign='center';vctx.textBaseline='middle';
                vctx.shadowColor='#c084fc';vctx.shadowBlur=30;
                vctx.fillText(randomPhrase,vertW/2,tY);vctx.shadowBlur=0;
                // CTA: icons + Wolfsheep in one row, website below, pure black bg, GPlay 56x56, logo-192 40x40 rounded with border
                var ctaTop=bY+600,ctaH=vertH-ctaTop,cy=ctaTop+16,ctaX=Math.round(vertW*0.2);
                vctx.fillStyle='#000000';vctx.fillRect(0,ctaTop,vertW,ctaH);
                var gplaySz=56,logoSz=40,iconGap=16;
                if(gplayImg&&gplayImg.complete&&gplayImg.naturalWidth>0)vctx.drawImage(gplayImg,ctaX,cy,gplaySz,gplaySz);
                if(iconImg&&iconImg.complete&&iconImg.naturalWidth>0){
                    var logoX=ctaX+gplaySz+iconGap,logoY=cy;
                    vctx.strokeStyle='#8a2be2';vctx.lineWidth=3;
                    vctx.beginPath();vctx.roundRect(logoX-1,logoY-1,logoSz+2,logoSz+2,logoSz*0.2);vctx.stroke();
                    vctx.save();
                    vctx.beginPath();vctx.roundRect(logoX,logoY,logoSz,logoSz,logoSz*0.2);vctx.clip();
                    vctx.drawImage(iconImg,logoX,logoY,logoSz,logoSz);
                    vctx.restore();
                }
                var textX=ctaX+gplaySz+iconGap+logoSz+12;
                vctx.fillStyle='#c084fc';vctx.font='bold 40px "Segoe UI", sans-serif';vctx.textAlign='left';vctx.textBaseline='middle';
                vctx.shadowColor='#c084fc';vctx.shadowBlur=20;
                vctx.fillText('Wolfsheep',textX,cy+gplaySz/2);vctx.shadowBlur=0;
                cy+=gplaySz+8;
                vctx.fillStyle='#94a3b8';vctx.font='26px "Segoe UI", sans-serif';vctx.textAlign='left';vctx.textBaseline='top';
                vctx.fillText('website: wolfsheep.fun',ctaX,cy);
            };
            ReplaySound.init();
            var cs=vertCanvas.captureStream(60),as=ReplaySound.getAudioStream(),rs;
            if(as){var at=as.getAudioTracks()[0];if(at){var vt=cs.getVideoTracks()[0];rs=new MediaStream([vt,at]);}else rs=cs;}else rs=cs;
            var chunks=[],rec,opts={mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:8000000};
            try{rec=new MediaRecorder(rs,opts);}catch(e){rec=new MediaRecorder(rs,{mimeType:'video/webm',videoBitsPerSecond:8000000});}
            rec.ondataavailable=function(ev){if(ev.data.size>0)chunks.push(ev.data);};
            rec.onstop=function(){
                replayActive=false;state=savedState;render();
                var blob=new Blob(chunks,{type:'video/webm'});
                var url=URL.createObjectURL(blob);var a=document.createElement('a');
                a.href=url;a.download='wolfsheep-replay.webm';
                document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
                recBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';
                resetBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';
                setStatus('📥 Video downloaded!',true);
            };
            rec.start();setStatus('🎬 Recording WebM...',false);
            var fw=state.winner,fr=state.winReason||'target',mo=[];
            for(var mi=0;mi<moveRecord.length;mi++){if(moveRecord[mi].type!=='emote')mo.push(moveRecord[mi]);}
            var zp=computeReplayZooms(mo);currentZoom=null;
            var rs2=Engine.initState(tc);rs2.gameOver=false;state=rs2;var idx=0,si=0;replayActive=true;render();drawVert(false);
            function step(){if(idx>=moveRecord.length){replayActive=false;rs2.gameOver=true;rs2.winner=fw;rs2.winReason=fr;state=rs2;render();drawVert(true);setTimeout(function(){rec.stop();},1200);return;}
            var mv=moveRecord[idx];if(mv.type==='emote'){playEmoteAnim(mv.emoteId,mv.fromPlayer);idx++;replayTimer=setTimeout(step,500);return;}
            Engine.applyAction(rs2,mv);var w=isWinningMove(mv,rs2);if(w!==null){rs2.gameOver=true;rs2.winner=w;rs2.winReason='target';fw=w;}else{Engine.endTurn(rs2);rs2.gameOver=false;}
            if(myIndex!==null){var sn=ReplaySound.getSoundForMove(mv,si,mo,myIndex,fw);if(sn)ReplaySound.play(sn);}
            if(zp.length>si)currentZoom=zp[si];si++;state=rs2;render();drawVert(false);idx++;
            var delay=getReplayDelay(mo,si-1)/speedMultiplier;replayTimer=setTimeout(step,Math.max(delay,50));}
            replayTimer=setTimeout(step,Math.max(500/speedMultiplier,50));
        }

        setStatus('🎬 Exporting MP4...',false);
        VideoExport.exportMP4({
            canvas:canvas,
            vertCanvas:vertCanvas,
            moveRecord:moveRecord,
            engine:Engine,
            ui:UI,
            tc:tc,
            myIndex:myIndex,
            finalWinner:state.winner,
            finalReason:state.winReason||'target',
            randomPhrase:randomPhrase,
            customPhrase:customPhrase||null,
            speedMultiplier:speedMultiplier||1,
            onProgress:function(phase,detail){
                if(phase==='render')setStatus('🎬 Rendering replay...',false);
                else if(phase==='encode')setStatus('🎬 Encoding: ' + detail,false);
                else if(phase==='audio')setStatus('🎬 Audio: ' + detail,false);
                else if(phase==='error'){setStatus('❌ ' + detail, true);restoreUI();}
            },
            onDone:function(blob){
                if(!blob){
                    setStatus('⚠ MP4 export failed — trying WebM...',false);
                    fallbackWebMExport();
                    return;
                }
                state=savedState;render();
                var url=URL.createObjectURL(blob);
                var a=document.createElement('a');a.href=url;a.download='wolfsheep-replay.mp4';
                document.body.appendChild(a);a.click();document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setStatus('📥 MP4 downloaded!',true);
                recBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';
                resetBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';
            }
        });
    }

    // ---- Replay ----
    recBtn.addEventListener('click',function(){
        if(replayActive)return;if(moveRecord.length<1)return;replayActive=true;recBtn.style.display='none';playAgainBtn.style.display='none';surrenderBtn.style.display='none';resetBtn.style.display='none';
        ReplaySound.init();var finalWinner=state.winner,finalReason=state.winReason||'target',total=moveRecord.length,movesOnly=[];
        for(var mi=0;mi<moveRecord.length;mi++){if(moveRecord[mi].type!=='emote')movesOnly.push(moveRecord[mi]);}
        var zoomPlan=computeReplayZooms(movesOnly);currentZoom=null;var replayState=Engine.initState(tc);replayState.gameOver=false;state=replayState;var idx=0,soundIdx=0;render();setStatus('⏯ Replay 0/'+total,false);
        function playNextStep(){if(!replayActive)return;if(idx>=moveRecord.length){replayTimer=null;replayState.gameOver=true;replayState.winner=finalWinner;replayState.winReason=finalReason;state=replayState;replayActive=false;if(finalWinner!==null&&finalWinner!==undefined){showReplayCTA();startWinAnimation(function(){recBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';resetBtn.style.display='inline-block';});}else{render();setStatus('⏯ '+__('game_draw'),true);recBtn.style.display='inline-block';downloadVidBtn.style.display='inline-block';playAgainBtn.style.display='inline-block';resetBtn.style.display='inline-block';}return;}var move=moveRecord[idx];if(move.type==='emote'){playEmoteAnim(move.emoteId,move.fromPlayer);setStatus('⏯ Replay '+(idx+1)+'/'+total+' 😀',false);idx++;replayTimer=setTimeout(playNextStep,500);return;}Engine.applyAction(replayState,move);var winPlayer=isWinningMove(move,replayState);if(winPlayer!==null){replayState.gameOver=true;replayState.winner=winPlayer;replayState.winReason='target';finalWinner=winPlayer;}else{Engine.endTurn(replayState);replayState.gameOver=false;}if(zoomPlan.length>soundIdx)currentZoom=zoomPlan[soundIdx];if(myIndex!==null){var soundName=ReplaySound.getSoundForMove(move,soundIdx,movesOnly,myIndex,finalWinner);if(soundName)ReplaySound.play(soundName);}soundIdx++;state=replayState;render();setStatus('⏯ Replay '+(idx+1)+'/'+total,false);idx++;var delay=getReplayDelay(movesOnly,soundIdx-1);replayTimer=setTimeout(playNextStep,delay);}
        replayTimer=setTimeout(playNextStep,500);
    });

    document.querySelector('.wait-text').textContent = __('game_searching');
    var emoteWrapper=document.getElementById('emote-toggle-wrapper'),emoteToggleBtn=document.getElementById('emote-toggle-btn'),emoteFlyout=document.getElementById('emote-flyout'),emoteBackdrop=document.getElementById('emote-backdrop'),boardWrapper=document.getElementById('board-wrapper'),emoteBtns=emoteFlyout.querySelectorAll('.emote-btn'),flyoutOpen=false;
    function toggleFlyout(show){flyoutOpen=typeof show==='boolean'?show:!flyoutOpen;if(flyoutOpen){emoteFlyout.classList.add('open');emoteToggleBtn.classList.add('active');emoteBackdrop.classList.add('show');}else{emoteFlyout.classList.remove('open');emoteToggleBtn.classList.remove('active');emoteBackdrop.classList.remove('show');}}
    emoteToggleBtn.addEventListener('click',function(e){e.stopPropagation();toggleFlyout();});emoteBackdrop.addEventListener('click',function(e){toggleFlyout(false);});document.addEventListener('click',function(e){if(flyoutOpen&&!emoteWrapper.contains(e.target))toggleFlyout(false);});
    function playEmoteAnim(emoteId,fromPlayer){if(!state||myIndex===null)return;var pp=state.players[fromPlayer];if(!pp)return;var pieceX=UI.cellCenterX(pp.col),pieceY=UI.cellCenterY(pp.row);var canvasRect=canvas.getBoundingClientRect(),wrapperRect=boardWrapper.getBoundingClientRect();var scaleX=canvasRect.width/canvas.width,scaleY=canvasRect.height/canvas.height;var sx=pieceX,sy=pieceY;if(myIndex===1){sx=canvas.width-pieceX;sy=canvas.height-pieceY;}var relX=(canvasRect.left-wrapperRect.left)+sx*scaleX,relY=(canvasRect.top-wrapperRect.top)+sy*scaleY;var offsetX=-38*scaleX,offsetY=-38*scaleY;var emoteEl=document.createElement('img');emoteEl.src='/emotes/emote-'+emoteId+'.webp';emoteEl.className='emote-anim';emoteEl.style.left=(relX+offsetX)+'px';emoteEl.style.top=(relY+offsetY)+'px';boardWrapper.appendChild(emoteEl);emoteEl.addEventListener('animationend',function(){if(emoteEl.parentNode)emoteEl.parentNode.removeChild(emoteEl);});}
    function sendEmote(emoteId){if(!gameStarted||!state||state.gameOver)return;var now=Date.now();if(now<emoteCooldown)return;emoteCooldown=now+2000;toggleFlyout(false);vibrate(5);network.sendEmote(emoteId);if(myIndex!==null)playEmoteAnim(emoteId,myIndex);emoteBtns.forEach(function(b){b.disabled=true;});emoteToggleBtn.disabled=true;setTimeout(function(){emoteBtns.forEach(function(b){b.disabled=false;});emoteToggleBtn.disabled=false;},2000);}
    emoteBtns.forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();var id=parseInt(btn.getAttribute('data-emote'));if(id)sendEmote(id);});});

    function handleCanvasClick(e){if(replayActive||!gameStarted||state.gameOver||myIndex!==state.turn)return;var pos=UI.getBoardPos(canvas,e.clientX,e.clientY,myIndex!=null?myIndex:0);if(!pos)return;if(wallMode){var wh=UI.findWallHit(canvas,pos.x,pos.y,state,wallMode);if(wh){vibrate(15);network.sendMove({type:'wall',row:wh.row,col:wh.col,orient:wallMode});setWallMode(null);}return;}if(!isMobile()){var wh=UI.findWallHit(canvas,pos.x,pos.y,state);if(wh){vibrate(15);network.sendMove({type:'wall',row:wh.row,col:wh.col,orient:wh.orient});return;}}var cell=UI.findCellHit(canvas,pos.x,pos.y);if(cell){vibrate(8);network.sendMove({type:'move',row:cell.row,col:cell.col});return;}}
    function updateHoverWallFromPos(pos){if(!pos||!state||state.gameOver||state.turn!==myIndex){hoverWall=null;return;}var activeOrient=wallMode||(wallDrag?wallDrag.orient:null);var wh=UI.findWallHit(canvas,pos.x,pos.y,state,activeOrient);if(wallMode&&wh&&wh.orient!==wallMode){hoverWall=null;}else if(wallDrag&&wh&&wh.orient!==wallDrag.orient){hoverWall=null;}else{hoverWall=wh||null;}}
    function handleMouseMove(e){if(!gameStarted){hoverWall=null;render();return;}var pos=UI.getBoardPos(canvas,e.clientX,e.clientY,myIndex!=null?myIndex:0);updateHoverWallFromPos(pos);render();}

    function handleTouchStartWall(orient,e){e.preventDefault();e.stopPropagation();if(!gameStarted||state.gameOver||myIndex!==state.turn)return;if(state.players[state.turn].walls<=0)return;wallDrag={orient:orient};wallMode=orient;setWallBtnActive();}
    function handleTouchMoveWall(e){if(!wallDrag)return;var t=e.touches[0];if(!t)return;var pos=UI.getBoardPos(canvas,t.clientX,t.clientY,myIndex!=null?myIndex:0);updateHoverWallFromPos(pos);render();}
    function handleTouchEndWall(e){if(!wallDrag)return;e.preventDefault();var orient=wallDrag.orient;wallDrag=null;wallMode=null;setWallBtnActive();var pos=null;if(e.changedTouches&&e.changedTouches[0]){var t=e.changedTouches[0];pos=UI.getBoardPos(canvas,t.clientX,t.clientY,myIndex!=null?myIndex:0);}if(pos){var wh=UI.findWallHit(canvas,pos.x,pos.y,state,orient);if(wh&&wh.orient===orient){vibrate(15);network.sendMove({type:'wall',row:wh.row,col:wh.col,orient:orient});}}hoverWall=null;render();}
    var wallBtnH=document.getElementById('wall-btn-h'),wallBtnV=document.getElementById('wall-btn-v'),wallBtnClear=document.getElementById('wall-btn-clear');
    function setWallBtnActive(){if(wallBtnH)wallBtnH.classList.toggle('active',wallMode==='horizontal');if(wallBtnV)wallBtnV.classList.toggle('active',wallMode==='vertical');}
    function setWallMode(mode){wallMode=mode;wallDrag=null;setWallBtnActive();hoverWall=null;render();}
    if(wallBtnH){wallBtnH.addEventListener('click',function(e){e.stopPropagation();if(!gameStarted||state.gameOver||myIndex!==state.turn)return;if(state.players[state.turn].walls<=0)return;setWallMode(wallMode==='horizontal'?null:'horizontal');});wallBtnH.addEventListener('touchstart',function(e){handleTouchStartWall('horizontal',e);},{passive:false});}
    if(wallBtnV){wallBtnV.addEventListener('click',function(e){e.stopPropagation();if(!gameStarted||state.gameOver||myIndex!==state.turn)return;if(state.players[state.turn].walls<=0)return;setWallMode(wallMode==='vertical'?null:'vertical');});wallBtnV.addEventListener('touchstart',function(e){handleTouchStartWall('vertical',e);},{passive:false});}
    if(wallBtnClear)wallBtnClear.addEventListener('click',function(e){e.stopPropagation();setWallMode(null);});
    canvas.addEventListener('touchmove',function(e){if(wallDrag){e.preventDefault();handleTouchMoveWall(e);}},{passive:false});
    canvas.addEventListener('touchend',function(e){handleTouchEndWall(e);});
    canvas.addEventListener('touchcancel',function(e){if(wallDrag){wallDrag=null;wallMode=null;setWallBtnActive();hoverWall=null;render();}});
    function updateNamesAndElo(d){var mc=d.color==='red'?0:1,oc=1-mc;if(d.playerName){myName.innerHTML=d.playerId?'<a href="/player.html?id='+d.playerId+'" target="_blank" style="color:#c084fc;text-decoration:none;cursor:pointer;">'+d.playerName+'</a>':d.playerName;}else{myName.textContent=UI.COLOR_NAMES[mc];}if(d.opponentName){opName.innerHTML=d.opponentId?'<a href="/player.html?id='+d.opponentId+'" target="_blank" style="color:#c084fc;text-decoration:none;cursor:pointer;">'+d.opponentName+'</a>':d.opponentName;}else{opName.textContent=UI.COLOR_NAMES[oc];}if(d.playerElo!==undefined)myElo.textContent='🏆 '+d.playerElo;else myElo.textContent='';if(d.opponentElo!==undefined)opElo.textContent='🏆 '+d.opponentElo;else opElo.textContent='';if(d.playerId){myDot.style.cursor='pointer';myDot.title='View profile';myDot.onclick=function(e){e.stopPropagation();window.open('/player.html?id='+d.playerId,'_blank');};}if(d.opponentId){opDot.style.cursor='pointer';opDot.title='View profile';opDot.onclick=function(e){e.stopPropagation();window.open('/player.html?id='+d.opponentId,'_blank');};}}
    window.addEventListener('beforeunload',function(){if(gameStarted&&!state.gameOver)network.disconnect();});
    canvas.addEventListener('click',handleCanvasClick);canvas.addEventListener('mousemove',handleMouseMove);canvas.addEventListener('mouseleave',function(){hoverWall=null;render();});
    network.connect();
    var isBot=sessionStorage.getItem('ws_bot')==='1',isChallenge=sessionStorage.getItem('ws_challenge')==='1',challengeRoomId=sessionStorage.getItem('ws_room');
    var urlParams=new URLSearchParams(window.location.search),urlRoom=urlParams.get('room');
    if(!isChallenge&&urlRoom){isChallenge=true;challengeRoomId=urlRoom;var urlTc=urlParams.get('tc');if(urlTc){tcName=urlTc;sessionStorage.setItem('ws_tc',urlTc);}}
    if(!userId){var lsUserId=localStorage.getItem('ws_userId');if(lsUserId)userId=parseInt(lsUserId);}
    if(isChallenge&&challengeRoomId){sessionStorage.removeItem('ws_challenge');network.joinChallenge(challengeRoomId,userId||null);}
    else if(isBot){network.botMatch(playerName,playerColor,tcName,userId?parseInt(userId):null);}
    else{network.autoMatch(playerName,playerColor,tcName,userId?parseInt(userId):null);}
    preloadDefaultImages();var labels=document.querySelectorAll('.time-label');if(labels[0])labels[0].textContent=__('game_opponent');if(labels[1])labels[1].textContent=__('game_you');
    setStatus(__('game_status'),false);turnBadge.textContent=__('game_turn');render();
})();