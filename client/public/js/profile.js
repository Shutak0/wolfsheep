// profile.js — профиль + регистрация WolfSheep
(function () {
    var __ = window.__ || function(k){return k;};
    var userId = localStorage.getItem('ws_userId');
    var profileView = document.getElementById('profile-view');
    var authView = document.getElementById('auth-view');

    // === Вкладка профиля (авторизованные) ===
    if (userId) {
        profileView.style.display = '';
        authView.style.display = 'none';

        var nameInput = document.getElementById('profileName');
        var colorInput = document.getElementById('profileColor');
        var saveBtn = document.getElementById('profileSaveBtn');
        var statRating = document.getElementById('stat-rating');
        var statGames = document.getElementById('stat-games');
        var statWins = document.getElementById('stat-wins');
        var statRate = document.getElementById('stat-rate');
        var msgEl = document.getElementById('profile-msg');

        function showMsg(text, color) {
            msgEl.textContent = text;
            msgEl.style.color = color || '#94a3b8';
        }

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
                    showMsg(__('profile_error'), '#ff3366');
                }
            })
            .catch(function () {
                nameInput.value = localStorage.getItem('ws_nick') || '';
                colorInput.value = localStorage.getItem('ws_color') || 'auto';
            });

        saveBtn.addEventListener('click', function () {
            var color = colorInput.value.trim().toLowerCase() || 'auto';
            if (['red', 'green', 'auto'].indexOf(color) === -1) color = 'auto';
            localStorage.setItem('ws_color', color);

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
                            showMsg(__('profile_nick_saved'), '#33ff66');
                        } else {
                            showMsg(data.error || 'Error.', '#ff3366');
                        }
                    });
            } else {
                showMsg(__('profile_saved'), '#33ff66');
            }
        });

        return;
    }

    // === Вкладка входа/регистрации (гости) ===
    profileView.style.display = 'none';
    authView.style.display = '';

    var tabs = authView.querySelectorAll('.auth-tab');
    var errorEl = document.getElementById('auth-error');
    var loginBtn = document.getElementById('loginBtn');
    var regBtn = document.getElementById('regBtn');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            authView.querySelectorAll('.auth-form').forEach(function (f) { f.classList.remove('active'); });
            document.getElementById('form-' + tab.dataset.tab).classList.add('active');
            errorEl.textContent = '';
        });
    });

    function showError(msg) { errorEl.textContent = msg; }

    function doAuth(url, username, password) {
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success) { showError(data.error); return; }
                localStorage.setItem('ws_userId', data.user.id);
                localStorage.setItem('ws_username', data.user.username);
                localStorage.setItem('ws_nick', data.user.nick);
                localStorage.setItem('ws_rating', data.user.rating || 1000);
                window.location.reload();
            })
            .catch(function () { showError(__('auth_error_network')); });
    }

    loginBtn.addEventListener('click', function () {
        var username = document.getElementById('loginUser').value.trim();
        var password = document.getElementById('loginPass').value;
        if (!username || !password) return showError(__('auth_error_fill'));
        doAuth('/api/login', username, password);
    });

    regBtn.addEventListener('click', function () {
        var username = document.getElementById('regUser').value.trim();
        var password = document.getElementById('regPass').value;
        if (!username || !password) return showError(__('auth_error_fill'));
        doAuth('/api/register', username, password);
    });
})();