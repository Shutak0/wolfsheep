// i18n.js – WolfSheep translations
(function () {
    const translations = {
        en: {
            // Navbar
            nav_home: '🏠 Home',
            nav_profile: '👤 Profile',
            nav_login: 'Login',
            nav_logout: 'Logout',
            online: 'online',
            // Homepage
            hero_tagline: 'Strategic duel on a grid board',
            hero_desc: 'Chase your opponent or break through to the goal – the choice is yours',
            section_choose: '🎮 Choose a mode',
            section_leaderboard: '🏆 Leaderboard',
            leaderboard_rank: '#',
            leaderboard_player: 'Player',
            leaderboard_elo: 'ELO',
            leaderboard_games: 'Games',
            leaderboard_loading: 'Loading...',
            leaderboard_empty: 'No games played yet',
            leaderboard_error: 'Failed to load leaderboard',
            section_howto: '🎯 How to play',
            step1: 'Register or play as guest',
            step2: 'Choose time control',
            step3: 'Wait for an opponent or invite a friend',
            step4: 'Move your piece or place walls',
            step5: 'Catch the opponent or reach the goal!',
            section_about: '📜 About the game',
            about_title1: 'Two players – two goals',
            about_text1: '<strong style="color:#ff3366">Wolf</strong> must catch the opponent by stepping on their cell. <strong style="color:#33ff66">Sheep</strong> must cross the entire board and reach the last row. Each player chooses a role and a strategy.',
            about_title2: 'Walls – your defense',
            about_text2: 'Each player starts with <strong>10 walls</strong>. Place them to block the opponent\'s path. Be careful: you cannot completely block the path – the opponent must always have a way to their goal.',
            about_title3: 'Moves and jumps',
            about_text3: 'On your turn, either <strong>move your piece</strong> to an adjacent cell (up, down, left, right) or <strong>place a wall</strong>. If you face the opponent, you can jump over them. If there is a wall or the edge behind them, you can move diagonally.',
            about_title4: 'Time control',
            about_text4: 'Choose your pace: <strong>blitz</strong> (1 min + 5 sec), <strong>standard</strong> (3 min + 2 sec), or <strong>classic</strong> (5 min no increment). Time runs only on your turn – act fast and precise.',
            about_title5: 'Rating and statistics',
            about_text5: 'Create an account to track your progress. The <strong>ELO</strong> rating system fairly evaluates your skill in every match. Beat strong opponents, climb the leaderboard, and become a legend!',
            about_title6: 'Unique style',
            about_text6: 'Neon aesthetics, smooth animations, and two colors – <strong style=\"color:#ff3366\">fiery red</strong> and <strong style=\"color:#33ff66\">emerald green</strong>. Upload your own avatar, customize your profile, and immerse yourself in the atmosphere of intense intellectual battle.',
            guest_banner: '⚠️ <strong>Guest mode</strong> – matched only with other guests, rating and stats not recorded. <a href="/login.html" style="color:#c084fc; text-decoration:underline;">Login</a> for full features.',
            guest_modal_title: 'Guest mode',
            guest_modal_text: 'You are not logged in. In guest mode:\n• Matchmaking only with other guests\n• ELO rating not awarded\n• Stats not saved\n\nWe recommend logging in for full functionality.\n\nContinue as guest?',
            // Mode cards
            mode_1_5: '1 + 5',
            mode_3_2: '3 + 2',
            mode_5: '5 min',
            mode_1_5_desc: '1 minute<br>+ 5 seconds per move',
            mode_3_2_desc: '3 minutes<br>+ 2 seconds per move',
            mode_5_desc: '5 minutes<br>no increment',
            mode_btn: 'Play',
            time_control_info: 'Time: 1 min + 5 sec/move',
            // Login page
            login_title: 'Login',
            register_title: 'Register',
            login_user_placeholder: 'Username',
            login_pass_placeholder: 'Password',
            reg_user_placeholder: 'Username (min 2 chars)',
            reg_pass_placeholder: 'Password (min 4 chars)',
            login_btn: 'Login',
            reg_btn: 'Register',
            auth_error_fill: 'Fill in all fields.',
            auth_error_network: 'Network error.',
            play_as_guest: 'Play without account',
            // Profile
            profile_title: 'Profile',
            profile_name_label: 'Nickname',
            profile_color_label: 'Favorite color',
            profile_save: '💾 Save',
            profile_saved: 'Settings saved.',
            profile_nick_saved: 'Nickname saved!',
            profile_error: 'Error loading profile.',
            profile_login_required: 'Please log in to view your profile.',
            stat_elo: 'ELO',
            stat_games: 'Games',
            stat_wins: 'Wins',
            stat_winrate: 'Winrate',
            // Game page
            game_title: 'WolfSheep',
            game_turn: '⬤ Red\'s turn',
            game_status: 'Click cell to move, click line for wall.',
            game_surrender: '🏳 Surrender',
            game_leave: '↺ Leave',
            game_searching: '🔍 Searching for opponent...',
            game_room_created: 'Room created! Waiting for opponent...',
            game_joined: 'Joined!',
            game_started: 'Game started! Your turn.',
            game_you_are: 'You are playing as',
            game_opponent: 'Opponent',
            game_you: 'You',
            game_not_your_turn: 'Not your turn.',
            game_invalid: 'Click a cell or a line.',
            game_win_target: 'won!',
            game_win_timeout: '(timeout)',
            game_win_surrender: '(surrender)',
            game_win_disconnect: '(disconnect)',
            game_draw: 'Draw!',
            game_draw_repetition: '(threefold repetition)',
            game_error: 'Error: ',
            game_opponent_left: 'Opponent disconnected. You win!',
            game_surrender_confirm: 'Are you sure you want to surrender?',
            game_red: 'Red',
            game_green: 'Green',
            game_winner: '🏆 {winner} won! {reason}',
            game_walls: '🧱',
            game_waiting_id: 'ID: {id}',
            play_again: 'Play Again',
            // Auth page (login.html)
            auth_tab_login: 'Login',
            auth_tab_register: 'Register',
            // Colors
            color_red: 'Red',
            color_green: 'Green',
            color_auto: 'Auto',
            // Challenge
            challenge_title: '⚔️ Invite to Battle',
            challenge_invite_btn: '⚔️ Invite',
            challenge_sending: '⏳ Sending…',
            challenge_received: '⚔️ {name} challenges you!',
            challenge_sent: '⚔️ Challenge sent! Waiting for response…',
            challenge_declined: '{name} declined your challenge.',
            challenge_player_offline: 'Player is offline right now.',
            challenge_challenger_offline: 'Challenger is no longer online.',
            challenge_accept: '✅ Accept',
            challenge_decline: '❌ Decline',
        },
        ru: {
            nav_home: '🏠 Главная',
            nav_profile: '👤 Профиль',
            nav_login: 'Войти',
            nav_logout: 'Выйти',
            online: 'онлайн',
            hero_tagline: 'Стратегическая дуэль на клеточном поле',
            hero_desc: 'Преследуй соперника или прорывайся к цели — выбор за тобой',
            section_choose: '🎮 Выберите режим',
            section_leaderboard: '🏆 Таблица лидеров',
            leaderboard_rank: '#',
            leaderboard_player: 'Игрок',
            leaderboard_elo: 'ELO',
            leaderboard_games: 'Игр',
            leaderboard_loading: 'Загрузка...',
            leaderboard_empty: 'Пока никто не сыграл ни одной игры',
            leaderboard_error: 'Не удалось загрузить таблицу',
            section_howto: '🎯 Как играть',
            step1: 'Зарегистрируйтесь или играйте без аккаунта',
            step2: 'Выберите временной контроль',
            step3: 'Дождитесь соперника или пригласите друга',
            step4: 'Ходите фишкой или ставьте стены',
            step5: 'Догоните врага или доберитесь до цели!',
            section_about: '📜 Об игре',
            about_title1: 'Два игрока — две цели',
            about_text1: '<strong style="color:#ff3366">Волк</strong> должен догнать соперника — встать на его клетку, чтобы победить. <strong style="color:#33ff66">Овца</strong> стремится пересечь всё поле и достичь последнего ряда. Каждый выбирает свою роль — и свою стратегию.',
            about_title2: 'Стены — ваша защита',
            about_text2: 'Каждый игрок начинает с <strong>10 стенами</strong>. Размещайте их на поле, чтобы блокировать путь сопернику. Но будьте осторожны: полностью перекрыть путь нельзя — у противника всегда должна оставаться дорога к цели.',
            about_title3: 'Ходы и прыжки',
            about_text3: 'За ход можно либо <strong>передвинуть фишку</strong> на соседнюю клетку (вверх, вниз, влево или вправо), либо <strong>установить стену</strong>. Если вы стоите напротив соперника — можно перепрыгнуть через него. А если за ним тоже есть стена или край поля — уйти в сторону по диагонали.',
            about_title4: 'Контроль времени',
            about_text4: 'Выберите удобный темп: <strong>блиц</strong> (1 мин + 5 сек), <strong>стандарт</strong> (3 мин + 2 сек) или <strong>классику</strong> (5 мин без добавления). Время идёт только в ваш ход — действуйте быстро и точно.',
            about_title5: 'Рейтинг и статистика',
            about_text5: 'Создайте аккаунт, чтобы отслеживать свой прогресс. Система рейтинга <strong>ELO</strong> честно оценивает ваше мастерство в каждой партии. Побеждайте сильных соперников, поднимайтесь в таблице лидеров и становитесь легендой!',
            about_title6: 'Уникальный стиль',
            about_text6: 'Неоновая эстетика, плавные анимации и два цвета — <strong style="color:#ff3366">огненно-красный</strong> и <strong style="color:#33ff66">изумрудно-зелёный</strong>. Загрузите собственную аватарку, настройте профиль и погрузитесь в атмосферу напряжённого интеллектуального сражения.',
            guest_banner: '⚠️ <strong>Гостевой режим</strong> — подбор только с гостями, рейтинг не начисляется. <a href="/login.html" style="color:#c084fc; text-decoration:underline;">Войдите</a> для полного функционала.',
            guest_modal_title: 'Гостевой режим',
            guest_modal_text: 'Вы не авторизованы. В гостевом режиме:\n• Подбор только с другими гостями\n• Рейтинг ELO не начисляется\n• Статистика не сохраняется\n\nРекомендуем войти в аккаунт для полного функционала.\n\nПродолжить как гость?',
            mode_1_5: '1 + 5',
            mode_3_2: '3 + 2',
            mode_5: '5 мин',
            mode_1_5_desc: '1 минута<br>+ 5 секунд за ход',
            mode_3_2_desc: '3 минуты<br>+ 2 секунды за ход',
            mode_5_desc: '5 минут<br>без добавления',
            mode_btn: 'Играть',
            time_control_info: 'Время: 1 мин + 5 сек/ход',
            login_title: 'Вход',
            register_title: 'Регистрация',
            login_user_placeholder: 'Логин',
            login_pass_placeholder: 'Пароль',
            reg_user_placeholder: 'Логин (от 2 символов)',
            reg_pass_placeholder: 'Пароль (от 4 символов)',
            login_btn: 'Войти',
            reg_btn: 'Зарегистрироваться',
            auth_error_fill: 'Заполните все поля.',
            auth_error_network: 'Ошибка сети.',
            play_as_guest: 'Играть без аккаунта',
            profile_title: 'Профиль',
            profile_name_label: 'Никнейм',
            profile_color_label: 'Любимый цвет',
            profile_save: '💾 Сохранить',
            profile_saved: 'Настройки сохранены.',
            profile_nick_saved: 'Ник сохранён!',
            profile_error: 'Ошибка загрузки профиля.',
            profile_login_required: 'Войдите в аккаунт для просмотра профиля.',
            stat_elo: 'ELO',
            stat_games: 'Игр',
            stat_wins: 'Побед',
            stat_winrate: 'Винрейт',
            game_title: 'WolfSheep',
            game_turn: '⬤ Ход Красного',
            game_status: 'Клик по клетке — ход, по линии — стена.',
            game_surrender: '🏳 Сдаться',
            game_leave: '↺ Выйти',
            game_searching: '🔍 Поиск соперника...',
            game_room_created: 'Комната создана! Ждём соперника...',
            game_joined: 'Присоединились!',
            game_started: 'Игра началась! Ваш ход.',
            game_you_are: 'Вы играете за',
            game_opponent: 'Соперник',
            game_you: 'Вы',
            game_not_your_turn: 'Сейчас не ваш ход.',
            game_invalid: 'Кликните по клетке или линии.',
            game_win_target: 'победил!',
            game_win_timeout: '(по времени)',
            game_win_surrender: '(сдача)',
            game_win_disconnect: '(отключение)',
            game_draw: 'Ничья!',
            game_draw_repetition: '(троекратное повторение)',
            game_error: 'Ошибка: ',
            game_opponent_left: 'Соперник отключился. Вы победили!',
            game_surrender_confirm: 'Вы уверены, что хотите сдаться?',
            game_red: 'Красный',
            game_green: 'Зелёный',
            game_winner: '🏆 {winner} победил! {reason}',
            game_walls: '🧱',
            game_waiting_id: 'ID: {id}',
            play_again: 'Сыграть ещё',
            auth_tab_login: 'Вход',
            auth_tab_register: 'Регистрация',
            color_red: 'Красный',
            color_green: 'Зелёный',
            color_auto: 'Авто',
            // Challenge
            challenge_title: '⚔️ Вызвать на бой',
            challenge_invite_btn: '⚔️ Вызвать',
            challenge_sending: '⏳ Отправка…',
            challenge_received: '⚔️ {name} вызывает вас на бой!',
            challenge_sent: '⚔️ Вызов отправлен! Ожидание ответа…',
            challenge_declined: '{name} отклонил ваш вызов.',
            challenge_player_offline: 'Игрок сейчас не в сети.',
            challenge_challenger_offline: 'Вызывающий игрок уже не в сети.',
            challenge_accept: '✅ Принять',
            challenge_decline: '❌ Отклонить',
        }
    };

    // Load language from localStorage or default to English
    var lang = localStorage.getItem('ws_lang') || 'en';
    var t = translations[lang] || translations['en'];

    // Apply translations to all elements with data-i18n attribute
    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (t[key]) {
                el.innerHTML = t[key];
            }
        });
        // Apply placeholder translations
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-placeholder');
            if (t[key]) {
                el.setAttribute('placeholder', t[key]);
            }
        });
    }

    // Expose translation function
    window.__ = function (key) {
        return t[key] || key;
    };

    // Expose current language
    window.ws_lang = lang;

    // Function to switch language
    window.switchLang = function (newLang) {
        localStorage.setItem('ws_lang', newLang);
        location.reload();
    };

    // Apply on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyTranslations);
    } else {
        applyTranslations();
    }

    // Build language switcher in navbar
    function buildLangSwitcher() {
        var navRight = document.getElementById('nav-right');
        if (!navRight) return;
        var switcher = document.createElement('select');
        switcher.style.cssText = 'background:#1a1a30; color:#c084fc; border:1px solid #2a1a5a; border-radius:8px; padding:4px 8px; font-family:inherit; font-size:13px; cursor:pointer; outline:none;';
        var enOpt = document.createElement('option');
        enOpt.value = 'en'; enOpt.textContent = '🇬🇧 EN'; if (lang === 'en') enOpt.selected = true;
        var ruOpt = document.createElement('option');
        ruOpt.value = 'ru'; ruOpt.textContent = '🇷🇺 RU'; if (lang === 'ru') ruOpt.selected = true;
        switcher.appendChild(enOpt);
        switcher.appendChild(ruOpt);
        switcher.addEventListener('change', function () {
            window.switchLang(this.value);
        });
        navRight.insertBefore(switcher, navRight.firstChild);
    }
    setTimeout(buildLangSwitcher, 0);
})();