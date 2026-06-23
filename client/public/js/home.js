// home.js — главная страница WolfSheep
(function () {
    var cards = document.querySelectorAll('.mode-card');
    cards.forEach(function (card) {
        var btn = card.querySelector('.tc-btn');
        btn.addEventListener('click', function () {
            var tc = card.dataset.tc;
            var userId = localStorage.getItem('ws_userId') || '';
            var name = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Игрок';
            var color = localStorage.getItem('ws_color') || 'auto';
            sessionStorage.setItem('ws_tc', tc);
            sessionStorage.setItem('ws_name', name);
            sessionStorage.setItem('ws_color', color);
            sessionStorage.setItem('ws_userId', userId);
            window.location.href = '/game.html';
        });
    });

    // Кнопка Войти/Выйти в навбаре
    var navRight = document.querySelector('#navbar');
    if (navRight) {
        var rightDiv = document.createElement('div');
        rightDiv.className = 'nav-right';
        var userId = localStorage.getItem('ws_userId');
        if (userId) {
            var nick = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Игрок';
            var nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'color:#c084fc; margin-right:12px; font-weight:600;';
            nameSpan.textContent = nick;
            rightDiv.appendChild(nameSpan);
            var logoutLink = document.createElement('a');
            logoutLink.href = '#';
            logoutLink.textContent = 'Выйти';
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
            loginLink.href = '/login.html';
            loginLink.textContent = 'Войти';
            loginLink.className = 'nav-link';
            rightDiv.appendChild(loginLink);
        }
    }
})();