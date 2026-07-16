// socket-challenge.js — глобальная система вызовов на бой через Socket.IO
// Подключать на всех страницах, где нужно принимать/отправлять вызовы.
// Регистрирует пользователя, слушает входящие вызовы и показывает toast-уведомление.

(function () {
    var __ = window.__ || function(k){return k;};

    var token = localStorage.getItem('ws_token');
    var userId = localStorage.getItem('ws_userId');
    var myId = userId ? parseInt(userId) : null;
    var myNick = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Player';

    var socket = null;
    var challengeToast = null;
    var challengeTimer = null;

    // Подключаем Socket.IO если пользователь авторизован
    if (!myId) return;

    function connectSocket() {
        if (socket && socket.connected) return;
        socket = io(window.location.origin, { transports: ['websocket', 'polling'] });

        socket.on('connect', function () {
            socket.emit('register_user', { userId: myId });
        });

        // Входящий вызов
        socket.on('challenge_received', function (data) {
            showChallengeToast(data);
        });

        // Вызов принят — редирект на игру
        socket.on('challenge_accepted', function (data) {
            hideChallengeToast();
            // Сохраняем данные в sessionStorage перед редиректом
            sessionStorage.setItem('ws_room', data.roomId);
            sessionStorage.setItem('ws_tc', data.timeControl || '1+5');
            sessionStorage.setItem('ws_challenge', '1');
            sessionStorage.setItem('ws_userId', myId);
            window.location.href = '/game.html?room=' + data.roomId + '&tc=' + (data.timeControl || '1+5');
        });

        // Вызов отклонён
        socket.on('challenge_declined', function (data) {
            var msg = __('challenge_declined').replace('{name}', data.fromName || 'Player');
            showInfoToast(msg);
        });

        // Ошибка вызова
        socket.on('challenge_error', function (data) {
            if (data.errorKey) {
                showInfoToast(__(data.errorKey));
            } else if (data.error) {
                showInfoToast(data.error);
            }
        });

        // Вызов отправлен
        socket.on('challenge_sent', function () {
            showInfoToast(__('challenge_sent'));
        });

        // Переподключение
        socket.on('disconnect', function () {
            setTimeout(function () {
                if (socket && !socket.connected) socket.connect();
            }, 3000);
        });
    }

    function getSocket() {
        if (!socket || !socket.connected) connectSocket();
        return socket;
    }

    // Toast для входящего вызова
    function showChallengeToast(data) {
        hideChallengeToast();

        var toast = document.createElement('div');
        toast.id = 'challenge-toast';
        toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;' +
            'background:#1a1a2e;border:2px solid #c084fc;border-radius:16px;padding:16px 20px;' +
            'display:flex;flex-direction:column;align-items:center;gap:12px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:280px;max-width:90vw;';

        var title = __('challenge_received').replace('{name}', escHtml(data.fromName));

        toast.innerHTML =
            '<div style="color:#fff;font-size:15px;font-weight:600;text-align:center;">' + title + '</div>' +
            '<div style="color:#94a3b8;font-size:13px;">⏱️ ' + escHtml(data.timeControl || '1+5') + '</div>' +
            '<div style="display:flex;gap:10px;">' +
            '<button id="challenge-accept-btn" style="background:#33ff66;color:#0a0a1a;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">' + __('challenge_accept') + '</button>' +
            '<button id="challenge-decline-btn" style="background:#ff3366;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">' + __('challenge_decline') + '</button>' +
            '</div>';

        document.body.appendChild(toast);
        challengeToast = toast;

        document.getElementById('challenge-accept-btn').addEventListener('click', function () {
            var s = getSocket();
            if (s) {
                s.emit('challenge_response', {
                    fromUserId: data.fromUserId,
                    accept: true,
                    timeControl: data.timeControl,
                    myName: myNick,
                    myId: myId
                });
            }
            hideChallengeToast();
        });

        document.getElementById('challenge-decline-btn').addEventListener('click', function () {
            var s = getSocket();
            if (s) {
                s.emit('challenge_response', {
                    fromUserId: data.fromUserId,
                    accept: false,
                    timeControl: data.timeControl,
                    myName: myNick,
                    myId: myId
                });
            }
            hideChallengeToast();
        });

        // Авто-скрытие через 30 секунд
        challengeTimer = setTimeout(hideChallengeToast, 30000);
    }

    function hideChallengeToast() {
        if (challengeTimer) { clearTimeout(challengeTimer); challengeTimer = null; }
        if (challengeToast && challengeToast.parentNode) {
            challengeToast.parentNode.removeChild(challengeToast);
        }
        challengeToast = null;
    }

    // Info toast (неблокирующий)
    var infoToastTimer = null;
    function showInfoToast(msg) {
        var existing = document.getElementById('info-toast');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        if (infoToastTimer) clearTimeout(infoToastTimer);

        var toast = document.createElement('div');
        toast.id = 'info-toast';
        toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99998;' +
            'background:#1a1a2e;border:1px solid #c084fc;border-radius:12px;padding:12px 20px;' +
            'color:#e0e0e0;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,0.4);text-align:center;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        infoToastTimer = setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 4000);
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // Экспортируем getSocket для вызова из player.js
    window._wsGetSocket = getSocket;
    window._wsMyNick = myNick;
    window._wsMyId = myId;

    // Подключаемся при загрузке
    connectSocket();
})();
