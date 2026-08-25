// Configuração do Firebase Auth para o projeto GCP
const firebaseConfig = {
  projectId: "listadetarefas-506523",
  authDomain: "listadetarefas-506523.firebaseapp.com"
};

// Inicializa o Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}

// Estado da Aplicação
let currentUser = null;
let tasks = [];
let activeFilter = 'all';

// Elementos do DOM - Auth & Perfil
const btnSignIn = document.getElementById('btnSignIn');
const userProfileArea = document.getElementById('userProfileArea');
const btnProfileTrigger = document.getElementById('btnProfileTrigger');
const profileDropdown = document.getElementById('profileDropdown');
const userAvatar = document.getElementById('userAvatar');
const dropdownAvatar = document.getElementById('dropdownAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const btnSignOut = document.getElementById('btnSignOut');

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

// 1. Inicialização e Monitoramento do Estado de Autenticação
document.addEventListener('DOMContentLoaded', () => {
  setupAuth();
  setupFilterListeners();
  setupEventListeners();
});

function setupAuth() {
  if (typeof firebase === 'undefined' || !firebase.auth) {
    console.warn('Firebase SDK não carregado. Operando em modo convidado.');
    fetchTasks();
    return;
  }

  // Observador de mudança de estado do usuário
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      renderUserProfile(user);
    } else {
      currentUser = null;
      renderGuestProfile();
    }
    // Recarrega tarefas correspondentes ao usuário ativo
    fetchTasks();
  });

  // Login com Google
  btnSignIn.addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      btnSignIn.disabled = true;
      btnSignIn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Conectando...';
      await firebase.auth().signInWithPopup(provider);
    } catch (error) {
      console.error('Erro no login:', error);
      alert('Não foi possível realizar o login com o Google: ' + error.message);
    } finally {
      btnSignIn.disabled = false;
      btnSignIn.innerHTML = `
        <svg class="google-svg" viewBox="0 0 24 24" width="18" height="18">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Entrar com Google</span>
      `;
    }
  });

  // Logout
  btnSignOut.addEventListener('click', async () => {
    await firebase.auth().signOut();
    profileDropdown.classList.add('hidden');
  });

  // Abrir/Fechar dropdown do avatar
  btnProfileTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
  });

  // Fechar dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    if (!userProfileArea.contains(e.target)) {
      profileDropdown.classList.add('hidden');
    }
  });
}

function renderUserProfile(user) {
  btnSignIn.classList.add('hidden');
  userProfileArea.classList.remove('hidden');

  const photoUrl = user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
  userAvatar.src = photoUrl;
  dropdownAvatar.src = photoUrl;
  userName.textContent = user.displayName || 'Usuário Google';
  userEmail.textContent = user.email || '';
}

function renderGuestProfile() {
  btnSignIn.classList.remove('hidden');
  userProfileArea.classList.add('hidden');
  profileDropdown.classList.add('hidden');
}

// 2. Helper de Cabeçalhos HTTP (injeta o ID do usuário)
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser && currentUser.uid) {
    headers['x-user-id'] = currentUser.uid;
  } else {
    headers['x-user-id'] = 'anonymous-guest';
  }
  return headers;
}

// 3. Buscar Tarefas
async function fetchTasks() {
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

// 4. Renderizar tarefas na tela
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
        <p>${currentUser ? 'Nenhuma tarefa encontrada.' : 'Faça login com sua conta Google para salvar suas tarefas personalizadas!'}</p>
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

// 5. Criar Tarefa
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

// 6. Atualizar Status
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

// 7. Deletar Tarefa
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

// Atualizar Contadores
function updateCounters() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;

  countAll.textContent = total;
  countPending.textContent = pending;
  countCompleted.textContent = completed;
}

// Filtros
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

function setupEventListeners() {
  btnAddTask.addEventListener('click', handleCreateTask);
  taskTitleInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCreateTask();
  });
  btnToggleDetails.addEventListener('click', () => {
    const isOpen = taskDetailsDrawer.classList.toggle('open');
    btnToggleDetails.classList.toggle('active', isOpen);
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
