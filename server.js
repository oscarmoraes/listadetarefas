const express = require('express');
const cors = require('cors');
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'listadetarefas-506523';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicialização do Google Cloud Firestore
let db;
let useMemoryFallback = false;
let memoryTasks = [
  {
    id: 'demo-1',
    title: 'Configurar projeto no Google Cloud Platform',
    description: 'Ativar APIs Cloud Run, Firestore e Artifact Registry',
    priority: 'high',
    category: 'Infraestrutura',
    completed: true,
    dueDate: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-2',
    title: 'Deploy da API no Cloud Run',
    description: 'Executar o script de deploy automatizado para o GCP',
    priority: 'medium',
    category: 'Deploy',
    completed: false,
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  }
];

try {
  db = new Firestore({
    projectId: PROJECT_ID,
    // Em produção no Cloud Run, as credenciais são injetadas automaticamente
    ignoreUndefinedProperties: true
  });
  console.log(`[GCP Firestore] Conectado ao projeto: ${PROJECT_ID}`);
} catch (error) {
  console.warn('[Aviso] Não foi possível autenticar diretamente no Firestore GCP localmente. Usando modo de desenvolvimento em memória.', error.message);
  useMemoryFallback = true;
}

const COLLECTION_NAME = 'tasks';

// 1. Healthcheck Endpoint (Padrão Cloud Run)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    project: PROJECT_ID,
    environment: process.env.NODE_ENV || 'development',
    storageMode: useMemoryFallback ? 'in-memory-fallback' : 'cloud-firestore'
  });
});

// 2. Listar todas as tarefas
app.get('/api/tasks', async (req, res) => {
  try {
    if (!useMemoryFallback) {
      try {
        const snapshot = await db.collection(COLLECTION_NAME).orderBy('createdAt', 'desc').get();
        const tasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        return res.json({ success: true, count: tasks.length, data: tasks });
      } catch (firestoreErr) {
        console.warn('[Firestore Fallback]', firestoreErr.message);
        // Fallback local se não houver credencial GCP no ambiente de dev local
        return res.json({ success: true, count: memoryTasks.length, data: memoryTasks, note: 'Memória local ativa' });
      }
    } else {
      return res.json({ success: true, count: memoryTasks.length, data: memoryTasks });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Criar nova tarefa
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description = '', priority = 'medium', category = 'Geral', dueDate = null } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, error: 'O título da tarefa é obrigatório.' });
    }

    const newTask = {
      title: title.trim(),
      description: description.trim(),
      priority, // 'low', 'medium', 'high'
      category,
      dueDate: dueDate || null,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!useMemoryFallback) {
      try {
        const docRef = await db.collection(COLLECTION_NAME).add(newTask);
        return res.status(201).json({
          success: true,
          data: { id: docRef.id, ...newTask }
        });
      } catch (firestoreErr) {
        console.warn('[Firestore Add Fallback]', firestoreErr.message);
      }
    }

    // Modo local / Fallback
    const localId = 'task-' + Date.now();
    const taskWithId = { id: localId, ...newTask };
    memoryTasks.unshift(taskWithId);
    res.status(201).json({ success: true, data: taskWithId });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Atualizar tarefa (Status, título, etc)
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };

    if (!useMemoryFallback) {
      try {
        const docRef = db.collection(COLLECTION_NAME).doc(id);
        const doc = await docRef.get();
        if (doc.exists) {
          await docRef.update(updates);
          const updatedDoc = await docRef.get();
          return res.json({ success: true, data: { id: docRef.id, ...updatedDoc.data() } });
        }
      } catch (firestoreErr) {
        console.warn('[Firestore Update Fallback]', firestoreErr.message);
      }
    }

    // Fallback local
    const index = memoryTasks.findIndex(t => t.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
    }
    memoryTasks[index] = { ...memoryTasks[index], ...updates };
    res.json({ success: true, data: memoryTasks[index] });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Deletar tarefa
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!useMemoryFallback) {
      try {
        await db.collection(COLLECTION_NAME).doc(id).delete();
        return res.json({ success: true, message: 'Tarefa excluída com sucesso.', id });
      } catch (firestoreErr) {
        console.warn('[Firestore Delete Fallback]', firestoreErr.message);
      }
    }

    // Fallback local
    const initialLen = memoryTasks.length;
    memoryTasks = memoryTasks.filter(t => t.id !== id);
    if (memoryTasks.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
    }
    res.json({ success: true, message: 'Tarefa excluída com sucesso.', id });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Iniciar Servidor
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Lista de Tarefas (Google Cloud API)`);
  console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`☁️ Projeto GCP: ${PROJECT_ID}`);
  console.log(`=========================================`);
});
