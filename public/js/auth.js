// ── Auth state ──
let currentUser = null;
let authMode = 'login'; // 'login' | 'signup'

// ── View gating ──
function showAuthView() {
  document.getElementById('auth-view').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('view-tabs').classList.add('hidden');
  document.getElementById('user-area').classList.add('hidden');
}

function showAppShell() {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('view-tabs').classList.remove('hidden');
  document.getElementById('user-area').classList.remove('hidden');
  document.getElementById('user-email-label').textContent = currentUser?.email || '';
}

// If a generate/history/follow-up call comes back 401 mid-session (expired or
// revoked token), drop back to the auth view instead of leaving the user
// looking at a broken app.
function handleSessionExpired() {
  currentUser = null;
  showAuthView();
  showToast('Your session expired. Please log in again.');
}

// ── Auth tabs (Login / Sign up toggle) ──
function setupAuthTabs() {
  const tabs = document.getElementById('auth-tabs');
  tabs.querySelectorAll('.auth-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.auth-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setAuthMode(btn.dataset.mode);
    });
  });
}

function setAuthMode(mode) {
  authMode = mode;
  const passwordInput = document.getElementById('auth-password');
  const hint = document.getElementById('auth-password-hint');
  const label = document.getElementById('auth-submit-label');

  hideAuthError();

  if (mode === 'signup') {
    passwordInput.setAttribute('autocomplete', 'new-password');
    hint.classList.remove('hidden');
    label.textContent = 'Sign up';
  } else {
    passwordInput.setAttribute('autocomplete', 'current-password');
    hint.classList.add('hidden');
    label.textContent = 'Log in';
  }
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideAuthError() {
  const el = document.getElementById('auth-error');
  el.classList.add('hidden');
  el.textContent = '';
}

// ── Submit handler (shared by login + signup) ──
async function handleAuthSubmit(e) {
  e.preventDefault();
  hideAuthError();

  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';

  const btn = document.getElementById('auth-submit-btn');
  const label = document.getElementById('auth-submit-label');
  const originalLabel = label.textContent;
  btn.disabled = true;
  label.textContent = authMode === 'signup' ? 'Creating account...' : 'Logging in...';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Server error ${response.status}`);
    }

    currentUser = data.user;
    document.getElementById('auth-form').reset();
    showAppShell();
    showToast(authMode === 'signup' ? `Welcome, ${currentUser.email}!` : `Welcome back, ${currentUser.email}!`);

  } catch (err) {
    showAuthError(err.message);
    console.error('Auth error:', err);
  }

  btn.disabled = false;
  label.textContent = originalLabel;
}

// ── Logout ──
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (err) {
    console.error('Logout error:', err);
  }
  currentUser = null;
  showAuthView();
  showToast('Logged out.');
}

// ── Session check on load ──
async function checkSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) {
      showAuthView();
      return;
    }
    const data = await response.json();
    currentUser = data.user;
    showAppShell();
  } catch (err) {
    console.error('Session check failed:', err);
    showAuthView();
  }
}

// ── Init ──
document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
setupAuthTabs();
checkSession();
