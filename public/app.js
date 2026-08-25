// Estado da aplicação
let tasks = [];
let activeFilter = 'all';

// Elementos do DOM
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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  fetchTasks();
  setupFilterListeners();
  setupEventListeners();
});

// 1. Alternar Drawer de Detalhes
btnToggleDetails.addEventListener('click', () => {
  const isOpen = taskDetailsDrawer.classList.toggle('open');
  btnToggleDetails.classList.toggle('active', isOpen);
});

// 2. Buscar tarefas da API
async function fetchTasks() {
  try {
    tasksContainer.innerHTML = `
      <div class="loading-state">
        <i class="fa-solid fa-circle-notch fa-spin"></i> Carregando tarefas...
      </div>
    `;

    const res = await fetch('/api/tasks');
    const result = await res.json();

    if (result.success) {
      tasks = result.data || [];
      renderTasks();
      updateCounters();
    } else {
      tasksContainer.innerHTML = `<div class="empty-box">Erro ao carregar tarefas: ${result.error}</div>`;
    }
  } catch (error) {
    console.error('Erro:', error);
    tasksContainer.innerHTML = `<div class="empty-box">Não foi possível conectar ao servidor.</div>`;
  }
}

// 3. Renderizar tarefas na tela
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
        <p>Nenhuma tarefa por aqui.</p>
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

// 4. Criar Tarefa
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
      headers: { 'Content-Type': 'application/json' },
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
      
      // Fechar gaveta se aberta
      taskDetailsDrawer.classList.remove('open');
      btnToggleDetails.classList.remove('active');
    } else {
      alert('Erro: ' + result.error);
    }
  } catch (err) {
    console.error('Erro de conexão ao criar tarefa:', err);
  } finally {
    btnAddTask.disabled = false;
  }
}

// 5. Alternar status (Completo/Pendente)
async function toggleTaskStatus(id, completed) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.completed = completed;
  renderTasks();
  updateCounters();

  try {
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
  }
}

// 6. Deletar Tarefa
async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  renderTasks();
  updateCounters();

  try {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Erro ao deletar tarefa:', err);
  }
}

// Atualizar Contadores nos Chips
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
