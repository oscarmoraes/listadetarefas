// Configuração Oficial do Firebase Web SDK
const firebaseConfig = {
  apiKey: "AIzaSyDRNgqdVD1a8R9IU7CbJWPPHz_YrsOYhXk",
  authDomain: "listadetarefas-506523.firebaseapp.com",
  projectId: "listadetarefas-506523",
  storageBucket: "listadetarefas-506523.firebasestorage.app",
  messagingSenderId: "160309533102",
  appId: "1:160309533102:web:2bffd8ce67ff4248e0503f",
  measurementId: "G-81QNH5JKW4"
};

// Inicialização do Firebase
if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log('[Firebase] Inicializado com sucesso!');
  } catch (e) {
    console.warn('[Firebase Init Warning]', e.message);
  }
}

// Provedor Google Auth
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Estado da Aplicação
let currentUser = null;
let tasks = [];
let activeFilter = 'all';

// Elementos do DOM - Auth & Perfil
const btnHeaderLogin = document.getElementById('btnHeaderLogin');
const userProfileArea = document.getElementById('userProfileArea');
const btnProfileTrigger = document.getElementById('btnProfileTrigger');
const profileDropdown = document.getElementById('profileDropdown');
const userAvatar = document.getElementById('userAvatar');
const dropdownAvatar = document.getElementById('dropdownAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const btnSignOut = document.getElementById('btnSignOut');

// Elementos do DOM - Boas-Vindas & Painel
const welcomeHero = document.getElementById('welcomeHero');
const tasksAppArea = document.getElementById('tasksAppArea');
const btnHeroGoogleLogin = document.getElementById('btnHeroGoogleLogin');
const btnHeroGuest = document.getElementById('btnHeroGuest');

// Elementos do DOM - Tarefas
const tasksContainer = document.getElementById('tasksContainer');
const taskTitleInput = document.getElementById('taskTitleInput');
const taskDescInput = document.getElementById('taskDescInput');
const taskCategorySelect = document.getElementById('taskCategorySelect');
const taskPrioritySelect = document.getElementById('taskPrioritySelect');
const taskDueDateInput = document.getElementById('taskDueDateInput');
const btnAddTask = document.getElementById('btnAddTask');
const btnToggleDetails = document.getElementById('btnToggleDetails');
const taskDetailsDrawer = document.getElementById('taskDetailsDrawer');

const countAll = document.getElementById('countAll');
const countPending = document.getElementById('countPending');
const countCompleted = document.getElementById('countCompleted');

// 1. Inicialização e Monitoramento do Auth State
document.addEventListener('DOMContentLoaded', () => {
  setupFirebaseAuthObserver();
  setupEventListeners();
  setupFilterListeners();
});

function setupFirebaseAuthObserver() {
  if (typeof firebase === 'undefined' || !firebase.auth) {
    console.warn('Firebase Auth SDK não disponível.');
    setLoggedOutState();
    return;
  }

  // Observa mudanças de estado de login em tempo real
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      console.log('[Auth] Usuário conectado:', user.email);
      currentUser = {
        uid: user.uid,
        displayName: user.displayName || user.email.split('@')[0],
        email: user.email,
        photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=2563EB&color=fff`
      };
      setLoggedInState(currentUser);
      fetchTasks();
    } else {
      console.log('[Auth] Nenhum usuário conectado.');
      // Checar se estava em modo convidado local
      const guestUser = localStorage.getItem('taskflow_guest_user');
      if (guestUser) {
        currentUser = JSON.parse(guestUser);
        setLoggedInState(currentUser);
        fetchTasks();
      } else {
        setLoggedOutState();
      }
    }
  });
}

function setLoggedInState(user) {
  btnHeaderLogin.classList.add('hidden');
  userProfileArea.classList.remove('hidden');

  const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=2563EB&color=fff`;
  userAvatar.src = photo;
  dropdownAvatar.src = photo;
  userName.textContent = user.displayName || 'Usuário';
  userEmail.textContent = user.email || (user.isGuest ? 'Modo Convidado' : '');

  welcomeHero.classList.add('hidden');
  tasksAppArea.classList.remove('hidden');
}

function setLoggedOutState() {
  currentUser = null;
  tasks = [];
  localStorage.removeItem('taskflow_guest_user');

  btnHeaderLogin.classList.remove('hidden');
  userProfileArea.classList.add('hidden');
  profileDropdown.classList.add('hidden');

  welcomeHero.classList.remove('hidden');
  tasksAppArea.classList.add('hidden');
}

// 2. Fluxo Oficial de Login com Google via Firebase Auth
async function loginWithGoogle() {
  if (typeof firebase === 'undefined' || !firebase.auth) {
    alert('SDK do Firebase não foi carregado. Verifique sua conexão.');
    return;
  }

  const buttons = [btnHeaderLogin, btnHeroGoogleLogin];
  buttons.forEach(btn => {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Conectando...';
    }
  });

  try {
    // 1. Tentar Login via Pop-up
    const result = await firebase.auth().signInWithPopup(googleProvider);
    console.log('[Auth Success]', result.user.displayName);
  } catch (error) {
    console.warn('[Popup Auth Error]', error.code, error.message);
    
    // Se o popup foi bloqueado pelo navegador, usa Redirect
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      try {
        await firebase.auth().signInWithRedirect(googleProvider);
      } catch (redirectErr) {
        alert('Erro ao redirecionar login: ' + redirectErr.message);
      }
    } else if (error.code === 'auth/unauthorized-domain') {
      alert('Domínio não autorizado no Firebase. Adicione o domínio do Cloud Run nas configurações do Firebase Authentication > Domínios Autorizados.');
    } else if (error.code !== 'auth/popup-closed-by-user') {
      alert('Erro no login com Google: ' + error.message);
    }
  } finally {
    const defaultBtnHtml = `
      <svg class="google-svg" viewBox="0 0 24 24" width="18" height="18">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      <span>Entrar com Google</span>
    `;
    buttons.forEach(btn => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = defaultBtnHtml;
      }
    });
  }
}

// 3. Modo Convidado
function loginAsGuest() {
  const guestUser = {
    uid: 'guest-' + (localStorage.getItem('guest_uid') || Math.random().toString(36).substring(2, 10)),
    displayName: 'Visitante',
    email: 'Modo Convidado',
    isGuest: true,
    photoURL: 'https://ui-avatars.com/api/?name=Visitante&background=64748B&color=fff'
  };
  localStorage.setItem('guest_uid', guestUser.uid.replace('guest-', ''));
  localStorage.setItem('taskflow_guest_user', JSON.stringify(guestUser));

  currentUser = guestUser;
  setLoggedInState(guestUser);
  fetchTasks();
}

// 4. Logout
async function handleSignOut() {
  localStorage.removeItem('taskflow_guest_user');
  if (typeof firebase !== 'undefined' && firebase.auth) {
    await firebase.auth().signOut();
  }
  setLoggedOutState();
}

// 5. Helper de Cabeçalhos HTTP
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser && currentUser.uid) {
    headers['x-user-id'] = currentUser.uid;
  } else {
    headers['x-user-id'] = 'anonymous';
  }
  return headers;
}

// 6. Buscar Tarefas
async function fetchTasks() {
  if (!currentUser) return;

  try {
    tasksContainer.innerHTML = `
      <div class="loading-state">
        <i class="fa-solid fa-circle-notch fa-spin"></i> Carregando suas tarefas...
      </div>
    `;

    const res = await fetch('/api/tasks', { headers: getAuthHeaders() });
    const result = await res.json();

    if (result.success) {
      tasks = result.data || [];
      renderTasks();
      updateCounters();
    } else {
      tasksContainer.innerHTML = `<div class="empty-box">Erro ao carregar tarefas: ${result.error}</div>`;
    }
  } catch (error) {
    console.error('Erro ao buscar tarefas:', error);
    tasksContainer.innerHTML = `<div class="empty-box">Não foi possível conectar ao servidor.</div>`;
  }
}

// 7. Renderizar Tarefas
function renderTasks() {
  const filteredTasks = tasks.filter(task => {
    if (activeFilter === 'pending') return !task.completed;
    if (activeFilter === 'completed') return task.completed;
    if (activeFilter === 'high') return task.priority === 'high';
    return true;
  });

  if (filteredTasks.length === 0) {
    tasksContainer.innerHTML = `
      <div class="empty-box">
        <p>Você não tem tarefas nesta categoria.</p>
        <p style="font-size: 12px; color: var(--text-subtle); margin-top: 4px;">Adicione uma tarefa no campo acima!</p>
      </div>
    `;
    return;
  }

  tasksContainer.innerHTML = filteredTasks.map(task => {
    const isCompleted = task.completed;
    const priorityLabel = task.priority === 'high' ? 'Alta' : (task.priority === 'medium' ? 'Média' : 'Baixa');
    const priorityClass = `tag-p-${task.priority || 'medium'}`;

    return `
      <div class="task-item ${isCompleted ? 'completed' : ''}" data-id="${task.id}">
        <input type="checkbox" class="task-check" ${isCompleted ? 'checked' : ''} onchange="toggleTaskStatus('${task.id}', this.checked)">
        
        <div class="task-body">
          <div class="task-text">${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-desc-text">${escapeHtml(task.description)}</div>` : ''}
          
          <div class="task-tags">
            <span class="tag tag-cat">${escapeHtml(task.category || 'Geral')}</span>
            <span class="tag ${priorityClass}">${priorityLabel}</span>
            ${task.dueDate ? `<span class="tag tag-date"><i class="fa-regular fa-calendar"></i> ${formatDate(task.dueDate)}</span>` : ''}
          </div>
        </div>

        <button class="task-delete" onclick="deleteTask('${task.id}')" title="Excluir">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  }).join('');
}

// 8. Criar Tarefa
async function handleCreateTask() {
  const title = taskTitleInput.value.trim();
  if (!title) {
    taskTitleInput.focus();
    return;
  }

  const payload = {
    title,
    description: taskDescInput.value.trim(),
    category: taskCategorySelect.value,
    priority: taskPrioritySelect.value,
    dueDate: taskDueDateInput.value || null
  };

  btnAddTask.disabled = true;

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      tasks.unshift(result.data);
      renderTasks();
      updateCounters();

      taskTitleInput.value = '';
      taskDescInput.value = '';
      taskDueDateInput.value = '';
      taskDetailsDrawer.classList.remove('open');
      btnToggleDetails.classList.remove('active');
    } else {
      alert('Erro: ' + result.error);
    }
  } catch (err) {
    console.error('Erro de conexão:', err);
  } finally {
    btnAddTask.disabled = false;
  }
}

// 9. Atualizar Status
async function toggleTaskStatus(id, completed) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.completed = completed;
  renderTasks();
  updateCounters();

  try {
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ completed })
    });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
  }
}

// 10. Deletar Tarefa
async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  renderTasks();
  updateCounters();

  try {
    await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  } catch (err) {
    console.error('Erro ao deletar tarefa:', err);
  }
}

// 11. Contadores
function updateCounters() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;

  countAll.textContent = total;
  countPending.textContent = pending;
  countCompleted.textContent = completed;
}

// 12. Listeners de Eventos
function setupEventListeners() {
  btnHeaderLogin.addEventListener('click', loginWithGoogle);
  btnHeroGoogleLogin.addEventListener('click', loginWithGoogle);
  btnHeroGuest.addEventListener('click', loginAsGuest);

  btnSignOut.addEventListener('click', handleSignOut);

  btnProfileTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!userProfileArea.contains(e.target)) {
      profileDropdown.classList.add('hidden');
    }
  });

  btnAddTask.addEventListener('click', handleCreateTask);
  taskTitleInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCreateTask();
  });
  btnToggleDetails.addEventListener('click', () => {
    const isOpen = taskDetailsDrawer.classList.toggle('open');
    btnToggleDetails.classList.toggle('active', isOpen);
  });
}

function setupFilterListeners() {
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderTasks();
    });
  });
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}
