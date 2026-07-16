// players.js — страница Players (друзья + список всех игроков + поиск)
(function () {
    var token = localStorage.getItem('ws_token');
    var userId = localStorage.getItem('ws_userId');
    var myId = userId ? parseInt(userId) : null;

    var searchInput = document.getElementById('players-search');
    var friendsGrid = document.getElementById('friends-grid');
    var friendsTitle = document.getElementById('friends-title');
    var friendsCount = document.getElementById('friends-count');
    var noFriendsMsg = document.getElementById('no-friends-msg');
    var playersList = document.getElementById('players-list');
    var playersCount = document.getElementById('players-count');
    var playersEmpty = document.getElementById('players-empty');

    var allPlayers = [];
    var myFriends = [];

    // Загружаем друзей (если авторизован) и всех игроков
    function loadAll() {
        // Загружаем всех игроков
        fetch('/api/players')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    allPlayers = data.players || [];
                    // Сортируем по ELO (по убыванию)
                    allPlayers.sort(function (a, b) { return (b.rating || 1000) - (a.rating || 1000); });
                    renderPlayers(allPlayers);
                } else {
                    playersList.innerHTML = '<div class="players-empty">Failed to load players.</div>';
                }
            })
            .catch(function () {
                playersList.innerHTML = '<div class="players-empty">Failed to load players.</div>';
            });

        // Загружаем друзей (только если авторизован)
        if (token && myId) {
            fetch('/api/friends', {
                headers: { 'Authorization': 'Bearer ' + token }
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.success) {
                        myFriends = data.friends || [];
                        renderFriends(myFriends);
                    } else {
                        hideFriends();
                    }
                })
                .catch(function () {
                    hideFriends();
                });
        } else {
            hideFriends();
        }
    }

    function renderFriends(friends) {
        if (!friends || friends.length === 0) {
            hideFriends();
            return;
        }

        friendsTitle.style.display = '';
        friendsCount.textContent = '(' + friends.length + ')';
        noFriendsMsg.style.display = 'none';

        var html = '';
        for (var i = 0; i < friends.length; i++) {
            var f = friends[i];
            var avatar = f.picture
                ? '<img class="friend-card-avatar" src="' + f.picture + '" alt="' + f.nick + '" />'
                : '<div class="friend-card-avatar">🐺</div>';
            html += '<a class="friend-card" href="/player.html?id=' + f.id + '">' +
                avatar +
                '<div class="friend-card-info">' +
                '<div class="friend-card-nick">' + escHtml(f.nick || 'Player #' + f.id) + '</div>' +
                '<div class="friend-card-rating">⭐ ' + (f.rating || 1000) + ' ELO</div>' +
                '</div>' +
                '</a>';
        }
        friendsGrid.innerHTML = html;
    }

    function hideFriends() {
        friendsTitle.style.display = 'none';
        friendsGrid.innerHTML = '';
        if (token && myId) {
            noFriendsMsg.style.display = '';
        } else {
            noFriendsMsg.style.display = 'none';
        }
    }

    function renderPlayers(players) {
        playersCount.textContent = '(' + players.length + ')';

        if (players.length === 0) {
            playersList.innerHTML = '';
            playersEmpty.style.display = '';
            return;
        }

        playersEmpty.style.display = 'none';

        var html = '';
        for (var i = 0; i < players.length; i++) {
            var p = players[i];
            var avatar = p.picture
                ? '<img class="player-row-avatar" src="' + p.picture + '" alt="' + p.nick + '" />'
                : '<div class="player-row-avatar">🐺</div>';
            var nick = p.nick || 'Player #' + p.id;
            var games = (p.stats && p.stats.games) ? p.stats.games : 0;
            var wins = (p.stats && p.stats.wins) ? p.stats.wins : 0;
            var rate = games > 0 ? Math.round(wins / games * 100) + '%' : '—';

            html += '<a class="player-row" href="/player.html?id=' + p.id + '">' +
                '<div class="player-row-rank">#' + (i + 1) + '</div>' +
                avatar +
                '<div class="player-row-info">' +
                '<div class="player-row-nick">' + escHtml(nick) + '</div>' +
                '<div class="player-row-stats">' + rate + ' winrate · ' + games + ' games</div>' +
                '</div>' +
                '<div class="player-row-games">' + games + '🎮</div>' +
                '<div class="player-row-rating">' + (p.rating || 1000) + '</div>' +
                '</a>';
        }
        playersList.innerHTML = html;
    }

    // Поиск
    if (searchInput) {
        var debounceTimer = null;
        searchInput.addEventListener('input', function () {
            var query = this.value.trim();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                if (!query) {
                    renderPlayers(allPlayers);
                    return;
                }
                // Быстрый клиентский поиск
                var q = query.toLowerCase();
                var filtered = allPlayers.filter(function (p) {
                    var nick = (p.nick || '').toLowerCase();
                    return nick.indexOf(q) !== -1;
                });
                // Сортируем результаты по релевантности (если начинается с запроса — выше)
                filtered.sort(function (a, b) {
                    var aNick = (a.nick || '').toLowerCase();
                    var bNick = (b.nick || '').toLowerCase();
                    var aStarts = aNick.indexOf(q) === 0 ? 0 : 1;
                    var bStarts = bNick.indexOf(q) === 0 ? 0 : 1;
                    if (aStarts !== bStarts) return aStarts - bStarts;
                    return (b.rating || 1000) - (a.rating || 1000);
                });
                renderPlayers(filtered);
            }, 250);
        });
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // Запуск
    loadAll();
})();