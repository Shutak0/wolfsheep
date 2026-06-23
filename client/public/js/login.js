// login.js — страница логина/регистрации WolfSheep
(function () {
    var tabs = document.querySelectorAll('.auth-tab');
    var errorEl = document.getElementById('auth-error');
    var loginBtn = document.getElementById('loginBtn');
    var regBtn = document.getElementById('regBtn');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(function (f) { f.classList.remove('active'); });
            document.getElementById('form-' + tab.dataset.tab).classList.add('active');
            errorEl.textContent = '';
        });
    });

    function showError(msg) { errorEl.textContent = msg; }

    loginBtn.addEventListener('click', function () {
        var username = document.getElementById('loginUser').value.trim();
        var password = document.getElementById('loginPass').value;
        if (!username || !password) return showError('Заполните все поля.');
        fetch('/api/login', {
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
            window.location.href = '/';
        })
        .catch(function () { showError('Ошибка сети.'); });
    });

    regBtn.addEventListener('click', function () {
        var username = document.getElementById('regUser').value.trim();
        var password = document.getElementById('regPass').value;
        if (!username || !password) return showError('Заполните все поля.');
        fetch('/api/register', {
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
            window.location.href = '/';
        })
        .catch(function () { showError('Ошибка сети.'); });
    });
})();