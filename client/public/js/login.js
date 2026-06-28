// login.js — Google OAuth авторизация WolfSheep
(function () {
    var errorEl = document.getElementById('auth-error');
    var loadingEl = document.getElementById('auth-loading');

    function showError(msg) {
        errorEl.textContent = msg;
        if (loadingEl) loadingEl.style.display = 'none';
    }

    function showLoading() {
        if (loadingEl) loadingEl.style.display = 'block';
        errorEl.textContent = '';
    }

    // Колбэк вызывается Google Identity Services после получения ID-токена
    window.handleGoogleLogin = function (response) {
        var idToken = response.credential;
        if (!idToken) {
            showError('Google sign-in failed. Please try again.');
            return;
        }

        showLoading();

        fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: idToken })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                showError(data.error || 'Authentication failed.');
                return;
            }
            // Сохраняем JWT и данные пользователя
            localStorage.setItem('ws_token', data.token);
            localStorage.setItem('ws_userId', data.user.id);
            localStorage.setItem('ws_username', data.user.username);
            localStorage.setItem('ws_nick', data.user.nick);
            localStorage.setItem('ws_rating', data.user.rating || 1000);
            localStorage.setItem('ws_email', data.user.email || '');
            localStorage.setItem('ws_picture', data.user.picture || '');
            window.location.href = '/';
        })
        .catch(function () {
            showError('Network error. Please try again.');
        });
    };
})();