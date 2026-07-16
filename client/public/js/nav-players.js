// nav-players.js — псевдо-счётчик игроков онлайн + динамическая ссылка Players
(function () {
    var el = document.getElementById('nav-players');
    if (!el) return;

    function randomPlayers() {
        return Math.floor(Math.random() * 60) + 390;
    }

    function update() {
        el.textContent = randomPlayers() + ' online';
    }

    update();
    setInterval(update, 5000 + Math.floor(Math.random() * 5000));

    // Добавляем ссылку "👥 Players" в навбар, если её ещё нет
    var navLeft = document.getElementById('nav-left-menu');
    if (navLeft) {
        var existing = navLeft.querySelector('a[href="/players.html"]');
        if (!existing) {
            var playersLink = document.createElement('a');
            playersLink.className = 'nav-link';
            playersLink.href = '/players.html';
            playersLink.textContent = '👥 Players';
            // Вставляем перед последним элементом (перед Profile или Home)
            var profileLink = navLeft.querySelector('a[href="/profile.html"]');
            if (profileLink) {
                navLeft.insertBefore(playersLink, profileLink);
            } else {
                navLeft.appendChild(playersLink);
            }
        }
    }
})();