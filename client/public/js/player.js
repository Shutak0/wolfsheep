// player.js — публичный профиль игрока WolfSheep (доступен всем, включая неавторизованных)
(function () {
    var __ = window.__ || function(k){return k;};

    var loadingView = document.getElementById('player-loading');
    var profileView = document.getElementById('player-view');
    var errorView = document.getElementById('player-error');
    var errorMsg = document.getElementById('player-error-msg');
    var friendBtnContainer = document.getElementById('friend-btn-container');
    var challengeSection = document.getElementById('challenge-section');

    var params = new URLSearchParams(window.location.search);
    var userIdStr = params.get('id');
    var userId = parseInt(userIdStr);

    var myToken = localStorage.getItem('ws_token');
    var myUserId = localStorage.getItem('ws_userId');
    var myId = myUserId ? parseInt(myUserId) : null;
    var myNick = localStorage.getItem('ws_nick') || localStorage.getItem('ws_username') || 'Player';

    if (!userIdStr || isNaN(userId) || userId < 1) {
        showError('No player ID specified. Use <code>?id=123</code> in the URL.');
        return;
    }

    document.title = 'Player #' + userId + ' — WolfSheep';

    // === Challenge setup ===
    var selectedTC = '1+5';
    if (challengeSection) {
        var tcBtns = challengeSection.querySelectorAll('.challenge-tc-btn');
        for (var i = 0; i < tcBtns.length; i++) {
            tcBtns[i].addEventListener('click', function () {
                for (var j = 0; j < tcBtns.length; j++) tcBtns[j].classList.remove('selected');
                this.classList.add('selected');
                selectedTC = this.getAttribute('data-tc');
            });
        }

        var inviteBtn = document.getElementById('challenge-invite-btn');
        if (inviteBtn) {
            inviteBtn.addEventListener('click', function () {
                var s = window._wsGetSocket ? window._wsGetSocket() : null;
                if (!s) {
                    window.location.href = '/login.html';
                    return;
                }
                inviteBtn.disabled = true;
                inviteBtn.textContent = __('challenge_sending');
                s.emit('challenge_player', {
                    targetUserId: userId,
                    timeControl: selectedTC,
                    challengerName: myNick,
                    challengerId: myId
                });
                setTimeout(function () {
                    inviteBtn.disabled = false;
                    inviteBtn.textContent = __('challenge_invite_btn');
                }, 3000);
            });
        }
    }

    // Скрываем/показываем challenge секцию если это свой профиль
    if (myId && myId === userId) {
        if (challengeSection) challengeSection.style.display = 'none';
    }

    // Загружаем публичный профиль
    fetch('/api/profile/' + userId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                showError(data.error || 'Player not found.');
                return;
            }

            var p = data.profile;
            document.title = (p.nick || 'Player #' + p.id) + ' — WolfSheep';

            document.getElementById('player-nick').textContent = p.nick || 'Player #' + p.id;
            document.getElementById('stat-rating').textContent = p.rating || 1000;
            document.getElementById('stat-games').textContent = (p.stats && p.stats.games) ? p.stats.games : 0;
            document.getElementById('stat-wins').textContent = (p.stats && p.stats.wins) ? p.stats.wins : 0;

            var games = (p.stats && p.stats.games) ? p.stats.games : 0;
            var wins = (p.stats && p.stats.wins) ? p.stats.wins : 0;
            var rate = games > 0 ? Math.round(wins / games * 100) + '%' : '—';
            document.getElementById('stat-rate').textContent = rate;

            if (p.picture) {
                var avatarEl = document.getElementById('player-avatar');
                avatarEl.innerHTML = '<img src="' + p.picture + '" alt="' + (p.nick || 'Player') + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;" />';
            }

            renderFriendButton(p.id);

            var shareLink = window.location.origin + '/player.html?id=' + p.id;
            var shareInput = document.getElementById('player-share-link');
            shareInput.value = shareLink;

            document.getElementById('player-share-copy').addEventListener('click', function () {
                shareInput.select();
                shareInput.setSelectionRange(0, 99999);
                navigator.clipboard.writeText(shareLink).then(function () {
                    var btn = document.getElementById('player-share-copy');
                    btn.textContent = '✅ Copied!';
                    setTimeout(function () { btn.textContent = '📋 Copy'; }, 2000);
                }).catch(function () {
                    document.execCommand('copy');
                    var btn = document.getElementById('player-share-copy');
                    btn.textContent = '✅ Copied!';
                    setTimeout(function () { btn.textContent = '📋 Copy'; }, 2000);
                });
            });

            if (loadingView) loadingView.style.display = 'none';
            if (errorView) errorView.style.display = 'none';
            profileView.style.display = '';
        })
        .catch(function (err) {
            console.error('Error loading public profile:', err);
            showError('Failed to load profile. Please try again later.');
        });

    function renderFriendButton(profileId) {
        if (!friendBtnContainer) return;

        if (myId && myId === profileId) {
            friendBtnContainer.innerHTML = '';
            return;
        }

        if (!myToken || !myId) {
            friendBtnContainer.innerHTML = '<a href="/login.html"><button class="friend-btn friend-btn-login">🔐 Login to add as friend</button></a>';
            return;
        }

        fetch('/api/friends', {
            headers: { 'Authorization': 'Bearer ' + myToken }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success) {
                    friendBtnContainer.innerHTML = '';
                    return;
                }
                var friends = data.friends || [];
                var isFriend = false;
                for (var i = 0; i < friends.length; i++) {
                    if (friends[i].id === profileId) { isFriend = true; break; }
                }

                if (isFriend) {
                    friendBtnContainer.innerHTML = '<button class="friend-btn friend-btn-remove" id="friend-action-btn" data-action="remove">➖ Remove Friend</button>';
                } else {
                    friendBtnContainer.innerHTML = '<button class="friend-btn friend-btn-add" id="friend-action-btn" data-action="add">➕ Add Friend</button>';
                }

                var actionBtn = document.getElementById('friend-action-btn');
                if (actionBtn) {
                    actionBtn.addEventListener('click', function () {
                        var action = this.getAttribute('data-action');
                        handleFriendAction(profileId, action, this);
                    });
                }
            })
            .catch(function () {
                friendBtnContainer.innerHTML = '';
            });
    }

    function handleFriendAction(friendId, action, btn) {
        btn.disabled = true;
        btn.className = 'friend-btn friend-btn-loading';
        btn.textContent = '⏳ …';

        var url = action === 'add' ? '/api/friend/add' : '/api/friend/remove';

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + myToken
            },
            body: JSON.stringify({ friendId: friendId })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    if (action === 'add') {
                        btn.className = 'friend-btn friend-btn-remove';
                        btn.setAttribute('data-action', 'remove');
                        btn.textContent = '➖ Remove Friend';
                    } else {
                        btn.className = 'friend-btn friend-btn-add';
                        btn.setAttribute('data-action', 'add');
                        btn.textContent = '➕ Add Friend';
                    }
                } else {
                    btn.className = 'friend-btn friend-btn-add';
                    btn.setAttribute('data-action', 'add');
                    btn.textContent = '⚠️ ' + (data.error || 'Error');
                    setTimeout(function () { btn.textContent = '➕ Add Friend'; }, 2000);
                }
                btn.disabled = false;
            })
            .catch(function () {
                btn.className = 'friend-btn friend-btn-add';
                btn.setAttribute('data-action', 'add');
                btn.textContent = '⚠️ Network error';
                btn.disabled = false;
                setTimeout(function () { btn.textContent = '➕ Add Friend'; }, 2000);
            });
    }

    function showError(message) {
        if (loadingView) loadingView.style.display = 'none';
        if (profileView) profileView.style.display = 'none';
        if (errorView) errorView.style.display = '';
        if (errorMsg) errorMsg.innerHTML = message;
        if (friendBtnContainer) friendBtnContainer.innerHTML = '';
        if (challengeSection) challengeSection.style.display = 'none';
    }
})();