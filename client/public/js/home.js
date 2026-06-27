// home.js — главная страница WolfSheep
(function () {
    var userId = localStorage.getItem('ws_userId');
    var __ = window.__ || function(k){return k;};

    // Гостевое предупреждение
    if (!userId) {
        var banner = document.createElement('div');
        banner.id = 'guest-banner';
        banner.style.cssText = 'position:fixed; top:56px; left:0; right:0; z-index:99; width:100%; background:#1a1020; border-bottom:1px solid #ffaa00; padding:8px 20px; text-align:center; color:#ffaa00; font-size:13px; line-height:1.4; backdrop-filter:blur(6px);';
        banner.innerHTML = __('guest_banner');
        document.body.appendChild(banner);
    }

    // Загрузка таблицы лидеров
    function loadLeaderboard() {
        var lb = document.getElementById('leaderboard');
        fetch('/api/leaderboard')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success || !data.players || !data.players.length) {
                    lb.innerHTML = '<div class="lb-row lb-header"><span class="lb-rank">' + __('leaderboard_rank') + '</span><span class="lb-name">' + __('leaderboard_player') + '</span><span class="lb-rating">' + __('leaderboard_elo') + '</span><span class="lb-games">' + __('leaderboard_games') + '</span></div><div class="lb-row"><span class="lb-empty">' + __('leaderboard_empty') + '</span></div>';
                    return;
                }
                var html = '<div class="lb-row lb-header"><span class="lb-rank">' + __('leaderboard_rank') + '</span><span class="lb-name">' + __('leaderboard_player') + '</span><span class="lb-rating">' + __('leaderboard_elo') + '</span><span class="lb-games">' + __('leaderboard_games') + '</span></div>';
                data.players.forEach(function (p, i) {
                    var topClass = i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : '';
                    html += '<div class="lb-row' + topClass + '"><span class="lb-rank">' + (i + 1) + '</span><span class="lb-name">' + escapeHtml(p.nick) + '</span><span class="lb-rating">' + p.rating + '</span><span class="lb-games">' + p.games + '</span></div>';
                });
                lb.innerHTML = html;
            })
            .catch(function () {
                lb.innerHTML = '<div class="lb-row lb-header"><span class="lb-rank">' + __('leaderboard_rank') + '</span><span class="lb-name">' + __('leaderboard_player') + '</span><span class="lb-rating">' + __('leaderboard_elo') + '</span><span class="lb-games">' + __('leaderboard_games') + '</span></div><div class="lb-row"><span class="lb-empty">' + __('leaderboard_error') + '</span></div>';
            });
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    loadLeaderboard();

    var cards = document.querySelectorAll('.mode-card');
    cards.forEach(function (card) {
        var btn = card.querySelector('.tc-btn');
        btn.addEventListener('click', function () {
            var tc = card.dataset.tc;
            var isBot = card.dataset.bot === 'true';
            var name = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Player';
            var color = localStorage.getItem('ws_color') || 'auto';
            sessionStorage.setItem('ws_tc', tc);
            sessionStorage.setItem('ws_name', name);
            sessionStorage.setItem('ws_color', color);
            sessionStorage.setItem('ws_userId', userId || '');
            sessionStorage.setItem('ws_bot', isBot ? '1' : '');
            window.location.href = '/game.html';
        });
    });

    // Кнопка Войти/Выйти в правой части навбара
    var rightDiv = document.getElementById('nav-right');
    if (rightDiv) {
        if (userId) {
            var nick = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Player';
            var nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'color:#c084fc; margin-right:12px; font-weight:600;';
            nameSpan.textContent = nick;
            rightDiv.appendChild(nameSpan);
            var logoutLink = document.createElement('a');
            logoutLink.href = '#';
            logoutLink.textContent = __('nav_logout');
            logoutLink.style.cssText = 'color:#94a3b8; font-size:14px;';
            logoutLink.addEventListener('click', function (e) {
                e.preventDefault();
                localStorage.removeItem('ws_userId');
                localStorage.removeItem('ws_username');
                localStorage.removeItem('ws_nick');
                window.location.reload();
            });
            rightDiv.appendChild(logoutLink);
        } else {
            var loginLink = document.createElement('a');
            loginLink.href = '/profile.html';
            loginLink.textContent = __('nav_login');
            loginLink.className = 'nav-link';
            rightDiv.appendChild(loginLink);
        }
    }
})();