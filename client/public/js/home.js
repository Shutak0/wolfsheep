// home.js — главная страница WolfSheep
(function () {
    var __ = window.__ || function(k){return k;};
    var userId = localStorage.getItem('ws_userId');

    // Гостевое предупреждение
    if (!userId) {
        var banner = document.createElement('div');
        banner.id = 'guest-banner';
        banner.style.cssText = 'position:fixed; top:var(--nav-height, 56px); left:0; right:0; z-index:99; width:100%; background:#1a1020; border-bottom:1px solid #ffaa00; padding:4px 10px; text-align:center; color:#ffaa00; font-size:11px; font-weight:500; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; backdrop-filter:blur(6px);';
        banner.innerHTML = __('guest_banner');
        document.body.appendChild(banner);
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function lbRow(rank, nick, rating, games, cls) {
        var topClass = rank === 1 ? ' top1' : rank === 2 ? ' top2' : rank === 3 ? ' top3' : '';
        return '<div class="lb-row' + topClass + (cls ? ' ' + cls : '') + '"><span class="lb-rank">' + rank + '</span><span class="lb-name">' + escapeHtml(nick) + '</span><span class="lb-rating">' + rating + '</span><span class="lb-games">' + games + '</span></div>';
    }

    // Загрузка таблицы лидеров (50 игроков, скролл)
    function loadLeaderboard() {
        var lb = document.getElementById('leaderboard');
        var myNick = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || null;
        var myUserId = userId ? parseInt(userId) : null;

        fetch('/api/leaderboard?limit=50')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success || !data.players || !data.players.length) {
                    lb.innerHTML = '<div class="lb-row lb-header"><span class="lb-rank">' + __('leaderboard_rank') + '</span><span class="lb-name">' + __('leaderboard_player') + '</span><span class="lb-rating">' + __('leaderboard_elo') + '</span><span class="lb-games">' + __('leaderboard_games') + '</span></div><div class="lb-row"><span class="lb-empty">' + __('leaderboard_empty') + '</span></div>';
                    return;
                }

                // Ищем пользователя в списке
                var userInList = false;
                if (myNick) {
                    for (var i = 0; i < data.players.length; i++) {
                        if (data.players[i].nick === myNick) {
                            userInList = true;
                            break;
                        }
                    }
                }

                var html = '<div class="lb-row lb-header"><span class="lb-rank">' + __('leaderboard_rank') + '</span><span class="lb-name">' + __('leaderboard_player') + '</span><span class="lb-rating">' + __('leaderboard_elo') + '</span><span class="lb-games">' + __('leaderboard_games') + '</span></div>';
                html += '<div class="lb-scroll">';

                data.players.forEach(function (p, i) {
                    var cls = (myNick && p.nick === myNick) ? 'me' : '';
                    html += lbRow(i + 1, p.nick, p.rating, p.games, cls);
                });

                html += '</div>';

                // Если пользователь в списке — он уже внутри скролла, footer не нужен
                // Если НЕ в списке — footer снаружи скролла
                if (!userInList && myUserId) {
                    html += '<div class="lb-me-footer" id="lb-me-footer"><span class="lb-rank">...</span><span class="lb-name">...</span><span class="lb-rating">...</span><span class="lb-games">...</span></div>';
                }

                // Загружаем позицию пользователя, если он не в топе
                if (!userInList && myUserId) {
                    fetch('/api/profile/rank', {
                        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('ws_token') }
                    })
                    .then(function (r) { return r.json(); })
                    .then(function (rankData) {
                        var footer = document.getElementById('lb-me-footer');
                        if (footer && rankData.success) {
                            footer.innerHTML = '<span class="lb-rank">' + rankData.rank + '</span>' +
                                '<span class="lb-name">' + escapeHtml(rankData.nick) + '</span>' +
                                '<span class="lb-rating">' + rankData.rating + '</span>' +
                                '<span class="lb-games">' + rankData.games + '</span>';
                        } else if (footer) {
                            footer.style.display = 'none';
                        }
                    })
                    .catch(function () {});
                }

                lb.innerHTML = html;
            })
            .catch(function () {
                lb.innerHTML = '<div class="lb-row lb-header"><span class="lb-rank">' + __('leaderboard_rank') + '</span><span class="lb-name">' + __('leaderboard_player') + '</span><span class="lb-rating">' + __('leaderboard_elo') + '</span><span class="lb-games">' + __('leaderboard_games') + '</span></div><div class="lb-row"><span class="lb-empty">' + __('leaderboard_error') + '</span></div>';
            });
    }

    loadLeaderboard();

    var cards = document.querySelectorAll('.mode-card');
    cards.forEach(function (card) {
        card.addEventListener('click', function () {
            var tc = card.dataset.tc;
            var isBot = card.dataset.bot === 'true';
            var name = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Player';
            var color = localStorage.getItem('ws_color') || 'auto';
            sessionStorage.setItem('ws_tc', tc);
            sessionStorage.setItem('ws_name', name);
            sessionStorage.setItem('ws_color', color);
            sessionStorage.setItem('ws_userId', userId ? parseInt(userId) : '');
            sessionStorage.setItem('ws_bot', isBot ? '1' : '');
            window.location.href = '/game.html';
        });
    });

    // Кнопка Войти/Выйти в правой части навбара
    var rightDiv = document.getElementById('nav-right');
    if (rightDiv) {
        if (userId) {
            var nick = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Player';
            var nameSpan = document.createElement('a');
            nameSpan.href = '/profile.html';
            nameSpan.style.cssText = 'color:#c084fc; margin-right:12px; font-weight:600; text-decoration:none;';
            nameSpan.textContent = nick;
            rightDiv.appendChild(nameSpan);
            var logoutLink = document.createElement('a');
            logoutLink.href = '#';
            logoutLink.textContent = __('nav_logout');
            logoutLink.style.cssText = 'color:#94a3b8; font-size:14px;';
            logoutLink.addEventListener('click', function (e) {
                e.preventDefault();
                localStorage.removeItem('ws_token');
                localStorage.removeItem('ws_userId');
                localStorage.removeItem('ws_username');
                localStorage.removeItem('ws_nick');
                localStorage.removeItem('ws_rating');
                localStorage.removeItem('ws_email');
                localStorage.removeItem('ws_picture');
                window.location.reload();
            });
            rightDiv.appendChild(logoutLink);
        } else {
            var loginLink = document.createElement('a');
            loginLink.href = '/login.html';
            loginLink.textContent = __('nav_login');
            loginLink.className = 'nav-link';
            rightDiv.appendChild(loginLink);
        }
    }
})();