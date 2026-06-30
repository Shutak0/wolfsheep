// login.js — Google OAuth + Password авторизация WolfSheep
(function () {
    // Ждём полной загрузки DOM
    function init() {
        var errorEl = document.getElementById('auth-error');
        var loadingEl = document.getElementById('auth-loading');
        var submitBtn = document.getElementById('submit-btn');
        var usernameInput = document.getElementById('username');
        var passwordInput = document.getElementById('password');
        var tabRegister = document.getElementById('tab-register');
        var tabLogin = document.getElementById('tab-login');

        if (!submitBtn || !usernameInput || !passwordInput || !tabRegister || !tabLogin) {
            // DOM ещё не готов — пробуем позже (не должно случаться, но страховка)
            setTimeout(init, 50);
            return;
        }

        var currentMode = 'register'; // 'register' | 'login'

        function showError(msg) {
            if (errorEl) errorEl.textContent = msg;
            if (loadingEl) loadingEl.style.display = 'none';
        }

        function showLoading() {
            if (loadingEl) loadingEl.style.display = 'block';
            if (errorEl) errorEl.textContent = '';
        }

        function saveUserData(data) {
            localStorage.setItem('ws_token', data.token);
            localStorage.setItem('ws_userId', data.user.id);
            localStorage.setItem('ws_username', data.user.username);
            localStorage.setItem('ws_nick', data.user.nick);
            localStorage.setItem('ws_rating', data.user.rating || 1000);
            localStorage.setItem('ws_email', data.user.email || '');
            localStorage.setItem('ws_picture', data.user.picture || '');
        }

        function doAuth() {
            var username = (usernameInput.value || '').trim();
            var password = passwordInput.value;

            if (!username || username.length < 2) {
                showError('Login must be at least 2 characters.');
                return;
            }
            if (!password || password.length < 4) {
                showError('Password must be at least 4 characters.');
                return;
            }

            showLoading();

            var endpoint = currentMode === 'register' ? '/api/auth/register' : '/api/auth/login';

            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success) {
                    showError(data.error || 'Authentication failed.');
                    return;
                }
                saveUserData(data);
                window.location.href = '/';
            })
            .catch(function () {
                showError('Network error. Please try again.');
            });
        }

        // Переключение табов
        window.switchTab = function (mode) {
            currentMode = mode;
            if (mode === 'register') {
                tabRegister.classList.add('active');
                tabLogin.classList.remove('active');
                submitBtn.textContent = 'Create Account';
                submitBtn.className = 'btn-register';
            } else {
                tabLogin.classList.add('active');
                tabRegister.classList.remove('active');
                submitBtn.textContent = 'Sign In';
                submitBtn.className = 'btn-login';
            }
            if (errorEl) errorEl.textContent = '';
        };

        // Клик по кнопке Submit
        submitBtn.addEventListener('click', function (e) {
            e.preventDefault();
            doAuth();
        });

        // Enter в полях
        passwordInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doAuth();
            }
        });
        usernameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doAuth();
            }
        });

        // Google OAuth колбэк
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
                saveUserData(data);
                window.location.href = '/';
            })
            .catch(function () {
                showError('Network error. Please try again.');
            });
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();