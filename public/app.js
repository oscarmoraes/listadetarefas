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

// 1. Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initUserSession();
  setupEventListeners();
  setupFilterListeners();
});

// 2. Gerenciamento de Sessão do Usuário
function initUserSession() {
  const savedUser = localStorage.getItem('taskflow_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      setLoggedInState(currentUser);
      fetchTasks();
      return;
    } catch (e) {
      localStorage.removeItem('taskflow_user');
    }
  }

  // Estado Inicial: Deslogado (Mostra Boas-Vindas sem spinner)
  setLoggedOutState();
}

function setLoggedInState(user) {
  // Atualiza Header
  btnHeaderLogin.classList.add('hidden');
  userProfileArea.classList.remove('hidden');

  const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=2563EB&color=fff`;
  userAvatar.src = photo;
  dropdownAvatar.src = photo;
  userName.textContent = user.displayName || 'Usuário';
  userEmail.textContent = user.email || (user.isGuest ? 'Modo Convidado' : '');

  // Alterna visualização para o app de tarefas
  welcomeHero.classList.add('hidden');
  tasksAppArea.classList.remove('hidden');
}

function setLoggedOutState() {
  currentUser = null;
  tasks = [];
  localStorage.removeItem('taskflow_user');

  btnHeaderLogin.classList.remove('hidden');
  userProfileArea.classList.add('hidden');
  profileDropdown.classList.add('hidden');

  // Mostra Boas-Vindas e esconde a lista de tarefas
  welcomeHero.classList.remove('hidden');
  tasksAppArea.classList.add('hidden');
}

// 3. Login com Google / Autenticação
async function handleGoogleLogin() {
  // Se Google Identity Services estiver disponível
  if (window.google && google.accounts && google.accounts.oauth2) {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: '160309533102-local.apps.googleusercontent.com', // Usará o client do GCP
      scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          try {
            const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
            }).then(r => r.json());

            const user = {
              uid: userInfo.sub,
              displayName: userInfo.name,
              email: userInfo.email,
              photoURL: userInfo.picture
            };
            loginSuccess(user);
            return;
          } catch (err) {
            console.error('Erro ao buscar dados do Google:', err);
          }
        }
      }
    });
    client.requestAccessToken();
    return;
  }

  // Fallback amigável de login
  const inputEmail = prompt('Digite seu e-mail do Google para entrar na sua Lista de Tarefas:');
  if (inputEmail && inputEmail.trim()) {
    const cleanEmail = inputEmail.trim().toLowerCase();
    const namePart = cleanEmail.split('@')[0];
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    const user = {
      uid: 'user-' + btoa(cleanEmail).replace(/=/g, '').substring(0, 16),
      displayName: formattedName,
      email: cleanEmail,
      photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(formattedName)}&background=2563EB&color=fff`
    };
    loginSuccess(user);
  }
}

function handleGuestLogin() {
  const guestUser = {
    uid: 'guest-' + (localStorage.getItem('guest_uid') || generateUID()),
    displayName: 'Visitante',
    email: 'Modo Local / Convidado',
    isGuest: true,
    photoURL: 'https://ui-avatars.com/api/?name=Visitante&background=64748B&color=fff'
  };
  localStorage.setItem('guest_uid', guestUser.uid.replace('guest-', ''));
  loginSuccess(guestUser);
}

function loginSuccess(user) {
  currentUser = user;
  localStorage.setItem('taskflow_user', JSON.stringify(user));
  setLoggedInState(user);
  fetchTasks();
}

function generateUID() {
  return Math.random().toString(36).substring(2, 10);
}

// 4. Helper de Cabeçalhos HTTP
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser && currentUser.uid) {
    headers['x-user-id'] = currentUser.uid;
  } else {
    headers['x-user-id'] = 'anonymous';
  }
  return headers;
}

// 5. Buscar Tarefas na API (Apenas quando logado)
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

// 6. Renderizar Tarefas
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

// 7. Criar Tarefa
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

      // Limpar formulário
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

// 8. Atualizar Status
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

// 9. Deletar Tarefa
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

// 10. Atualizar Contadores
function updateCounters() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;

  countAll.textContent = total;
  countPending.textContent = pending;
  countCompleted.textContent = completed;
}

// 11. Eventos e Listeners
function setupEventListeners() {
  btnHeaderLogin.addEventListener('click', handleGoogleLogin);
  btnHeroGoogleLogin.addEventListener('click', handleGoogleLogin);
  btnHeroGuest.addEventListener('click', handleGuestLogin);

  btnSignOut.addEventListener('click', setLoggedOutState);

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
