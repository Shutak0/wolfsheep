// profile.js — профиль WolfSheep (Google OAuth + JWT)
(function () {
    var __ = window.__ || function(k){return k;};
    var token = localStorage.getItem('ws_token');
    var userId = localStorage.getItem('ws_userId');
    var profileView = document.getElementById('profile-view');
    var authView = document.getElementById('auth-view');

    // Колбэк для Google Identity Services (на profile.html)
    window.handleGoogleLoginProfile = function (response) {
        var idToken = response.credential;
        var errorEl = document.getElementById('auth-error');
        var loadingEl = document.getElementById('auth-loading');
        if (!idToken) {
            errorEl.textContent = 'Google sign-in failed. Please try again.';
            return;
        }
        if (loadingEl) loadingEl.style.display = 'block';
        errorEl.textContent = '';

        fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: idToken })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                errorEl.textContent = data.error || 'Authentication failed.';
                if (loadingEl) loadingEl.style.display = 'none';
                return;
            }
            localStorage.setItem('ws_token', data.token);
            localStorage.setItem('ws_userId', data.user.id);
            localStorage.setItem('ws_username', data.user.username);
            localStorage.setItem('ws_nick', data.user.nick);
            localStorage.setItem('ws_rating', data.user.rating || 1000);
            localStorage.setItem('ws_email', data.user.email || '');
            localStorage.setItem('ws_picture', data.user.picture || '');
            window.location.reload();
        })
        .catch(function () {
            errorEl.textContent = 'Network error. Please try again.';
            if (loadingEl) loadingEl.style.display = 'none';
        });
    };

    // ======== Вкладка профиля (авторизованные) ========
    if (userId && token) {
        profileView.style.display = '';
        if (authView) authView.style.display = 'none';

        var nameInput = document.getElementById('profileName');
        var colorInput = document.getElementById('profileColor');
        var saveBtn = document.getElementById('profileSaveBtn');
        var statRating = document.getElementById('stat-rating');
        var statGames = document.getElementById('stat-games');
        var statWins = document.getElementById('stat-wins');
        var statRate = document.getElementById('stat-rate');
        var msgEl = document.getElementById('profile-msg');

        // Share-ссылка на публичный профиль
        var shareLink = window.location.origin + '/player.html?id=' + userId;
        var shareInput = document.getElementById('player-share-link');
        if (shareInput) {
            shareInput.value = shareLink;
        }
        var shareCopyBtn = document.getElementById('player-share-copy');
        if (shareCopyBtn) {
            shareCopyBtn.addEventListener('click', function () {
                if (shareInput) {
                    shareInput.select();
                    shareInput.setSelectionRange(0, 99999);
                }
                navigator.clipboard.writeText(shareLink).then(function () {
                    shareCopyBtn.textContent = '✅ Copied!';
                    setTimeout(function () { shareCopyBtn.textContent = '📋 Copy'; }, 2000);
                }).catch(function () {
                    document.execCommand('copy');
                    shareCopyBtn.textContent = '✅ Copied!';
                    setTimeout(function () { shareCopyBtn.textContent = '📋 Copy'; }, 2000);
                });
            });
        }

        function showMsg(text, color) {
            msgEl.textContent = text;
            msgEl.style.color = color || '#94a3b8';
        }

        fetch('/api/profile', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
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
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ nick: nick })
                })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (data.success) {
                            localStorage.setItem('ws_nick', data.nick);
                            showMsg(__('profile_nick_saved'), '#33ff66');
                        } else {
                            showMsg(data.error || 'Error.', '#ff3366');
                        }
                    })
                    .catch(function () {
                        showMsg('Network error.', '#ff3366');
                    });
            } else {
                showMsg(__('profile_saved'), '#33ff66');
            }
        });

        return;
    }

    // ======== Вкладка входа (гости) — редирект ========
    window.location.href = '/login.html';
})();