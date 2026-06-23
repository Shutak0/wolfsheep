// profile.js — страница профиля WolfSheep
(function () {
    var nameInput = document.getElementById('profileName');
    var colorInput = document.getElementById('profileColor');
    var saveBtn = document.getElementById('profileSaveBtn');
    var statRating = document.getElementById('stat-rating');
    var statGames = document.getElementById('stat-games');
    var statWins = document.getElementById('stat-wins');
    var statRate = document.getElementById('stat-rate');

    var userId = localStorage.getItem('ws_userId');
    if (!userId) {
        alert('Войдите в аккаунт для просмотра профиля.');
        window.location.href = '/login.html';
        return;
    }

    // Загружаем профиль с сервера
    fetch('/api/profile?userId=' + userId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                var p = data.profile;
                nameInput.value = p.nick || p.username;
                colorInput.value = localStorage.getItem('ws_color') || 'auto';
                statRating.textContent = p.rating || 1000;
                statGames.textContent = p.stats.games;
                statWins.textContent = p.stats.wins;
                statRate.textContent = p.stats.games > 0 ? Math.round(p.stats.wins / p.stats.games * 100) + '%' : '—';
            } else {
                alert('Ошибка загрузки профиля.');
            }
        })
        .catch(function () {
            // Fallback to localStorage
            nameInput.value = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || '';
            colorInput.value = localStorage.getItem('ws_color') || 'auto';
        });

    saveBtn.addEventListener('click', function () {
        var color = colorInput.value.trim().toLowerCase() || 'auto';
        if (['red', 'green', 'auto'].indexOf(color) === -1) color = 'auto';
        localStorage.setItem('ws_color', color);

        // Попытка сменить ник (только если не задан)
        var nick = nameInput.value.trim();
        if (nick && nick !== localStorage.getItem('ws_nick')) {
            fetch('/api/profile/nick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: parseInt(userId), nick: nick })
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.success) {
                        localStorage.setItem('ws_nick', data.nick);
                        alert('Ник сохранён!');
                    } else {
                        alert(data.error || 'Ошибка.');
                    }
                });
        } else {
            alert('Настройки сохранены!');
        }
    });
})();