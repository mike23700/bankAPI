// API Base URL - since we are serving this from the backend, we can use relative paths
// Alternatively, if testing separate from backend, use "http://localhost:8000" or the production URL
const API_URL = ""; 

// State
let state = {
    token: localStorage.getItem('auth_token'),
    user: null,
    transactions: []
};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (state.token) {
        checkAuth();
    }
});

// ==========================================
// UI & Navigation
// ==========================================
function switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
}

function switchNav(section) {
    // Update sidebar
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    // Update content
    document.querySelectorAll('.section-content').forEach(sec => sec.classList.remove('active-section'));
    document.getElementById(`sec-${section}`).classList.add('active-section');

    // Load data based on section
    if (section === 'transactions') {
        loadTransactions(true);
    } else if (section === 'overview') {
        loadTransactions(false);
    } else if (section === 'search') {
        loadAllAccounts();
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.getElementById(viewId).classList.add('active-view');
}

// Modals
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    // Reset inputs
    document.querySelectorAll(`#${modalId} input`).forEach(input => {
        if(input.type === 'number') input.value = '';
        if(input.type === 'text' && input.id.includes('description')) {
            // Keep default values for descriptions if needed
        } else if(input.type !== 'checkbox') {
            input.value = '';
        }
    });
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}

// Notifications
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    
    let icon = 'bx-info-circle';
    if(type === 'success') icon = 'bx-check-circle';
    if(type === 'error') icon = 'bx-error-circle';
    if(type === 'warning') icon = 'bx-error';

    notif.innerHTML = `<i class='bx ${icon}'></i> <span>${message}</span>`;
    
    container.appendChild(notif);
    
    // Animate in
    setTimeout(() => notif.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// Formatting
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF' }).format(amount).replace('XAF', 'FCFA');
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('fr-FR', options);
}

// ==========================================
// Authentication
// ==========================================
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showNotification('Veuillez remplir tous les champs', 'error');
        return;
    }

    try {
        const formData = new URLSearchParams();
        formData.append('username', email); // OAuth2 expects 'username'
        formData.append('password', password);

        const res = await fetch(`${API_URL}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData
        });

        if (!res.ok) throw new Error('Identifiants incorrects');

        const data = await res.json();
        state.token = data.access_token;
        localStorage.setItem('auth_token', state.token);
        
        await checkAuth();
        showNotification('Connexion réussie', 'success');
        
        // Clear inputs
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

    if (!nom || !email || !code) {
        showNotification('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/comptes/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ nom, email, code, solde_initial })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Erreur lors de la création du compte');

        showNotification('Compte créé avec succès! Veuillez vous connecter.', 'success');
        switchAuthTab('login');
        document.getElementById('login-email').value = email;
        
        // Clear inputs
        document.getElementById('register-name').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
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
        loadTransactions();
    } catch (error) {
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
        if (!res.ok) throw new Error(data.detail || 'Erreur lors de l\'opération');

        showNotification(data.message, 'success');
        closeModal(modalId);
        
        // Update local state and UI
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
// Data Fetching & UI Updates
// ==========================================
function updateDashboardUI() {
    document.getElementById('user-name').textContent = state.user.nom.split(' ')[0];
    document.getElementById('total-balance').textContent = formatCurrency(state.user.solde);
    document.getElementById('settings-id').textContent = state.user.id;
    document.getElementById('settings-email').textContent = state.user.email;
}

async function loadTransactions(fullList = false) {
    try {
        const res = await fetch(`${API_URL}/transactions`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!res.ok) throw new Error('Erreur lors du chargement des transactions');

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
        html = '<div class="p-4 text-center text-muted">Aucune transaction trouvée.</div>';
    } else {
        const displayTxs = fullList ? state.transactions : state.transactions.slice(0, 5);
        
        displayTxs.forEach(tx => {
            let iconClass, icon, sign, amountClass;
            
            if (tx.type === 'depot' || tx.type === 'transfert_recu') {
                iconClass = 'depot';
                icon = 'bx-down-arrow-alt';
                sign = '+';
                amountClass = 'positive';
            } else {
                iconClass = 'retrait';
                icon = 'bx-up-arrow-alt';
                sign = '-';
                amountClass = 'negative';
            }

            html += `
                <div class="transaction-item">
                    <div class="tx-info">
                        <div class="tx-icon ${iconClass}">
                            <i class='bx ${icon}'></i>
                        </div>
                        <div class="tx-details">
                            <h4>${tx.description}</h4>
                            <p>${formatDate(tx.date)}</p>
                        </div>
                    </div>
                    <div class="tx-amount ${amountClass}">
                        ${sign}${formatCurrency(tx.montant)}
                    </div>
                </div>
            `;
        });
    }

    if (fullList) {
        allList.innerHTML = html;
    } else {
        recentList.innerHTML = html;
    }
}

// ==========================================
// Search & Settings
// ==========================================

async function loadAllAccounts() {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = `
        <div class="accounts-loading">
            <i class='bx bx-loader-alt bx-spin'></i>
            <span>Chargement des comptes...</span>
        </div>
    `;
    try {
        const res = await fetch(`${API_URL}/comptes/`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!res.ok) throw new Error('Erreur lors du chargement des comptes');
        const accounts = await res.json();
        renderAccounts(accounts);
    } catch (error) {
        resultsContainer.innerHTML = `<div class="text-muted">Erreur: ${error.message}</div>`;
    }
}

function renderAccounts(accounts) {
    const resultsContainer = document.getElementById('search-results');
    if (accounts.length === 0) {
        resultsContainer.innerHTML = '<div class="text-muted">Aucun compte trouvé.</div>';
        return;
    }
    resultsContainer.innerHTML = accounts.map(acc => `
        <div class="account-card glass-panel">
            <div class="account-avatar">${acc.nom.charAt(0).toUpperCase()}</div>
            <h4><i class='bx bx-user-circle text-primary'></i> ${acc.nom}</h4>
            <p><i class='bx bx-id-card'></i> ID: <code>${acc.id}</code></p>
            <p><i class='bx bx-envelope'></i> ${acc.email}</p>
            <p class="account-balance"><i class='bx bx-wallet'></i> ${formatCurrency(acc.solde)}</p>
            ${acc.id !== state.user.id ? `
                <button class="btn btn-primary btn-sm mt-2 w-full" onclick="prepareTransfer('${acc.id}')">
                    <i class='bx bx-transfer'></i> Transférer vers ce compte
                </button>
            ` : '<div class="badge-own-account"><i class=\'bx bx-check-circle\'></i> Votre compte</div>'}
        </div>
    `).join('');
}

let searchTimeout;
async function searchAccounts() {
    clearTimeout(searchTimeout);
    const query = document.getElementById('search-query').value.trim();
    
    // Si la recherche est vide, afficher tous les comptes
    if (query.length === 0) {
        loadAllAccounts();
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`${API_URL}/recherche?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });

            if (!res.ok) throw new Error('Erreur de recherche');

            const results = await res.json();
            renderAccounts(results);

        } catch (error) {
            console.error(error);
        }
    }, 300);
}

function prepareTransfer(destId) {
    document.getElementById('transfer-dest').value = destId;
    switchNav('overview');
    openModal('transfer-modal');
}

async function handleDeleteAccount() {
    const confirmation = document.getElementById('delete-confirm').checked;
    const mot_de_passe = document.getElementById('delete-password').value;

    if (!confirmation) return showNotification('Vous devez cocher la case de confirmation', 'error');
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
