// nav-players.js — псевдо-счётчик игроков онлайн
(function () {
    var el = document.getElementById('nav-players');
    if (!el) return;

    function randomPlayers() {
        // Равномерный разброс около 420 ± 30
        return Math.floor(Math.random() * 60) + 390;
    }

    function update() {
        el.textContent =  randomPlayers() + ' online';
    }

    update();
    setInterval(update, 5000 + Math.floor(Math.random() * 5000));
})();