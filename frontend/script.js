// API Base URL
const API_URL = "";

// State
let state = {
  token: localStorage.getItem('auth_token'),
  user: null,
  transactions: []
};

// ==========================================
// Init
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  if (state.token) checkAuth();
});

// ==========================================
// UI & Navigation
// ==========================================
function switchAuthTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`${tab}-form`).classList.add('active');
}

function switchNav(section) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');
  _activateSection(section);
}

function switchNavDirect(section) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = [...document.querySelectorAll('.nav-btn')]
    .find(b => b.getAttribute('onclick')?.includes(`'${section}'`));
  if (target) target.classList.add('active');
  _activateSection(section);
}

function _activateSection(section) {
  document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active-section'));
  document.getElementById(`sec-${section}`).classList.add('active-section');

  if (section === 'transactions') loadTransactions(true);
  else if (section === 'overview') loadTransactions(false);
  else if (section === 'search') loadAllAccounts();
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.getElementById(viewId).classList.add('active-view');
}

function openModal(id) { document.getElementById(id).classList.add('active'); }

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.querySelectorAll(`#${id} input`).forEach(input => {
    if (input.type === 'number') input.value = '';
    else if (input.type !== 'checkbox' && !input.id.includes('description')) input.value = '';
  });
}

window.onclick = e => {
  if (e.target.classList.contains('modal')) e.target.classList.remove('active');
};

// ==========================================
// Notifications
// ==========================================
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;

  const icons = { success: 'bx-check-circle', error: 'bx-error-circle', warning: 'bx-error', info: 'bx-info-circle' };
  notif.innerHTML = `<i class='bx ${icons[type] || icons.info}'></i><span>${message}</span>`;
  container.appendChild(notif);

  setTimeout(() => notif.remove(), 3500);
}

// ==========================================
// Formatting
// ==========================================
function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF' })
    .format(amount)
    .replace('XAF', 'FCFA');
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ==========================================
// Auth
// ==========================================
async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showNotification('Veuillez remplir tous les champs', 'error');

  try {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const res = await fetch(`${API_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    if (!res.ok) throw new Error('Identifiants incorrects');
    const data = await res.json();
    state.token = data.access_token;
    localStorage.setItem('auth_token', state.token);
    await checkAuth();
    showNotification('Connexion réussie', 'success');
    document.getElementById('login-password').value = '';
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function register() {
  const nom = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const code = document.getElementById('register-password').value;
  const solde_initial = parseFloat(document.getElementById('register-balance').value || 0);

  if (!nom || !email || !code) return showNotification('Veuillez remplir tous les champs obligatoires', 'error');

  try {
    const res = await fetch(`${API_URL}/comptes/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, email, code, solde_initial })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erreur lors de la création');

    showNotification('Compte créé ! Vous pouvez vous connecter.', 'success');
    switchAuthTab('login');
    document.getElementById('login-email').value = email;
    ['register-name', 'register-email', 'register-password'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('register-balance').value = '0';
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function logout() {
  state = { token: null, user: null, transactions: [] };
  localStorage.removeItem('auth_token');
  showView('auth-view');
  showNotification('Déconnexion réussie', 'info');
}

async function checkAuth() {
  try {
    const res = await fetch(`${API_URL}/mon-compte`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) throw new Error('Session expirée');
    state.user = await res.json();
    updateDashboardUI();
    showView('dashboard-view');
    loadTransactions(false);
  } catch {
    logout();
  }
}

// ==========================================
// Operations
// ==========================================
async function performOperation(endpoint, payload, modalId) {
  try {
    const res = await fetch(`${API_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Erreur lors de l'opération");

    showNotification(data.message, 'success');
    closeModal(modalId);
    state.user.solde = data.nouveau_solde;
    updateDashboardUI();
    loadTransactions(document.getElementById('sec-transactions').classList.contains('active-section'));
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function handleDeposit() {
  const montant = parseFloat(document.getElementById('deposit-amount').value);
  const description = document.getElementById('deposit-description').value || 'Dépôt';
  if (!montant || montant <= 0) return showNotification('Montant invalide', 'error');
  performOperation('depot', { montant, description }, 'deposit-modal');
}

function handleWithdraw() {
  const montant = parseFloat(document.getElementById('withdraw-amount').value);
  const description = document.getElementById('withdraw-description').value || 'Retrait';
  if (!montant || montant <= 0) return showNotification('Montant invalide', 'error');
  performOperation('retrait', { montant, description }, 'withdraw-modal');
}

function handleTransfer() {
  const compte_destination_id = document.getElementById('transfer-dest').value;
  const montant = parseFloat(document.getElementById('transfer-amount').value);
  const description = document.getElementById('transfer-description').value || 'Transfert';
  if (!compte_destination_id) return showNotification('ID de destination requis', 'error');
  if (!montant || montant <= 0) return showNotification('Montant invalide', 'error');
  performOperation('transfert', { montant, compte_destination_id, description }, 'transfer-modal');
}

// ==========================================
// UI Updates
// ==========================================
function updateDashboardUI() {
  const firstName = state.user.nom.split(' ')[0];
  document.getElementById('user-name').textContent = firstName;
  document.getElementById('sidebar-user-name').textContent = firstName;
  document.getElementById('total-balance').textContent = formatCurrency(state.user.solde);
  document.getElementById('balance-account-id').textContent = `Compte #${state.user.id}`;
  document.getElementById('settings-id').textContent = state.user.id;
  document.getElementById('settings-email').textContent = state.user.email;
}

// ==========================================
// Transactions
// ==========================================
async function loadTransactions(fullList = false) {
  try {
    const res = await fetch(`${API_URL}/transactions`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) throw new Error('Erreur de chargement');
    state.transactions = await res.json();
    renderTransactions(fullList);
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function renderTransactions(fullList = false) {
  const recentList = document.getElementById('recent-transactions-list');
  const allList = document.getElementById('all-transactions-list');
  let html = '';

  if (state.transactions.length === 0) {
    html = '<div class="text-muted" style="padding:1rem 0; font-size:0.85rem;">Aucune transaction pour l\'instant.</div>';
  } else {
    const txs = fullList ? state.transactions : state.transactions.slice(0, 5);
    txs.forEach(tx => {
      const isCredit = tx.type === 'depot' || tx.type === 'transfert_recu';
      let iconClass = 'retrait';
      let icon = 'bx-up-arrow-alt';
      if (tx.type === 'depot') {
        iconClass = 'depot'; icon = 'bx-down-arrow-alt';
      } else if (tx.type === 'transfert' || tx.type === 'transfert_recu') {
        iconClass = 'transfert'; icon = 'bx-transfer';
      }
      const sign = isCredit ? '+' : '-';
      const amountClass = isCredit ? 'positive' : 'negative';

      html += `
        <div class="transaction-item">
          <div class="transaction-icon ${iconClass}">
            <i class='bx ${icon}'></i>
          </div>
          <div class="transaction-details">
            <h4>${tx.description}</h4>
            <p>${formatDate(tx.date)}</p>
          </div>
          <div class="transaction-amount ${amountClass}">
            ${sign}${formatCurrency(tx.montant)}
          </div>
        </div>
      `;
    });
  }

  if (fullList) allList.innerHTML = html;
  else recentList.innerHTML = html;
}

// ==========================================
// Search & Accounts
// ==========================================
async function loadAllAccounts() {
  const container = document.getElementById('search-results');
  container.innerHTML = `
    <div class="accounts-loading">
      <i class='bx bx-loader-alt bx-spin'></i>
      <span>Chargement des comptes…</span>
    </div>
  `;
  try {
    const res = await fetch(`${API_URL}/comptes/`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) throw new Error('Erreur de chargement');
    renderAccounts(await res.json());
  } catch (error) {
    container.innerHTML = `<div class="text-muted">Erreur : ${error.message}</div>`;
  }
}

function renderAccounts(accounts) {
  const container = document.getElementById('search-results');
  if (!accounts.length) {
    container.innerHTML = '<div class="text-muted">Aucun compte trouvé.</div>';
    return;
  }
  container.innerHTML = accounts.map(acc => `
    <div class="account-card glass-panel">
      <div class="account-avatar">${acc.nom.charAt(0).toUpperCase()}</div>
      <h4>${acc.nom}</h4>
      <p><i class='bx bx-id-card'></i> ID : <code>${acc.id}</code></p>
      <p><i class='bx bx-envelope'></i> ${acc.email}</p>
      <span class="balance"><i class='bx bx-wallet'></i> ${formatCurrency(acc.solde)}</span>
      ${acc.id !== state.user?.id
        ? `<button class="btn btn-primary btn-sm mt-2 w-full" style="margin-top:1rem;" onclick="prepareTransfer('${acc.id}')">
             <i class='bx bx-transfer'></i> Transférer vers ce compte
           </button>`
        : `<div class="badge-own-account"><i class='bx bx-check-circle'></i> Votre compte</div>`
      }
    </div>
  `).join('');
}

let searchTimeout;
async function searchAccounts() {
  clearTimeout(searchTimeout);
  const query = document.getElementById('search-query').value.trim();
  if (!query) { loadAllAccounts(); return; }

  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`${API_URL}/recherche?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      if (!res.ok) throw new Error('Erreur de recherche');
      renderAccounts(await res.json());
    } catch (error) {
      console.error(error);
    }
  }, 300);
}

function prepareTransfer(destId) {
  document.getElementById('transfer-dest').value = destId;
  switchNavDirect('overview');
  openModal('transfer-modal');
}

async function handleDeleteAccount() {
  const confirmation = document.getElementById('delete-confirm').checked;
  const mot_de_passe = document.getElementById('delete-password').value;

  if (!confirmation) return showNotification('Cochez la case de confirmation', 'error');
  if (!mot_de_passe) return showNotification('Mot de passe requis', 'error');

  try {
    const res = await fetch(`${API_URL}/comptes/${state.user.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ confirmation, mot_de_passe })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erreur lors de la suppression');

    closeModal('delete-account-modal');
    showNotification('Compte supprimé définitivement', 'success');
    logout();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}