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
let memoryTasks = [];

try {
  db = new Firestore({
    projectId: PROJECT_ID,
    ignoreUndefinedProperties: true
  });
  console.log(`[GCP Firestore] Conectado ao projeto: ${PROJECT_ID}`);
} catch (error) {
  console.warn('[Aviso] Modo de desenvolvimento local ativo.', error.message);
  useMemoryFallback = true;
}

const COLLECTION_NAME = 'tasks';

// Middleware para extrair ID do usuário da requisição
function extractUserId(req) {
  return req.headers['x-user-id'] || 'anonymous';
}

// 1. Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    project: PROJECT_ID,
    storageMode: useMemoryFallback ? 'in-memory-fallback' : 'cloud-firestore'
  });
});

// 2. Listar tarefas do usuário logado
app.get('/api/tasks', async (req, res) => {
  try {
    const userId = extractUserId(req);

    if (!useMemoryFallback) {
      try {
        const snapshot = await db.collection(COLLECTION_NAME)
          .where('userId', '==', userId)
          .get();

        const tasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Ordenar por data de criação decrescente
        tasks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        return res.json({ success: true, count: tasks.length, data: tasks });
      } catch (firestoreErr) {
        console.warn('[Firestore Query Fallback]', firestoreErr.message);
      }
    }

    // Fallback local
    const userTasks = memoryTasks.filter(t => t.userId === userId);
    return res.json({ success: true, count: userTasks.length, data: userTasks });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Criar nova tarefa associada ao usuário
app.post('/api/tasks', async (req, res) => {
  try {
    const userId = extractUserId(req);
    const { title, description = '', priority = 'medium', category = 'Geral', dueDate = null } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, error: 'O título da tarefa é obrigatório.' });
    }

    const newTask = {
      userId,
      title: title.trim(),
      description: description.trim(),
      priority,
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

    // Fallback local
    const localId = 'task-' + Date.now();
    const taskWithId = { id: localId, ...newTask };
    memoryTasks.unshift(taskWithId);
    res.status(201).json({ success: true, data: taskWithId });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Atualizar tarefa (valida se pertence ao usuário)
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const userId = extractUserId(req);
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.userId; // impede troca de dono

    if (!useMemoryFallback) {
      try {
        const docRef = db.collection(COLLECTION_NAME).doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
        }

        const data = doc.data();
        if (data.userId && data.userId !== userId) {
          return res.status(403).json({ success: false, error: 'Não autorizado a alterar esta tarefa.' });
        }

        await docRef.update(updates);
        const updatedDoc = await docRef.get();
        return res.json({ success: true, data: { id: docRef.id, ...updatedDoc.data() } });
      } catch (firestoreErr) {
        console.warn('[Firestore Update Fallback]', firestoreErr.message);
      }
    }

    // Fallback local
    const index = memoryTasks.findIndex(t => t.id === id && t.userId === userId);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
    }
    memoryTasks[index] = { ...memoryTasks[index], ...updates };
    res.json({ success: true, data: memoryTasks[index] });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Deletar tarefa (valida se pertence ao usuário)
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const userId = extractUserId(req);
    const { id } = req.params;

    if (!useMemoryFallback) {
      try {
        const docRef = db.collection(COLLECTION_NAME).doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
        }

        const data = doc.data();
        if (data.userId && data.userId !== userId) {
          return res.status(403).json({ success: false, error: 'Não autorizado a excluir esta tarefa.' });
        }

        await docRef.delete();
        return res.json({ success: true, message: 'Tarefa excluída com sucesso.', id });
      } catch (firestoreErr) {
        console.warn('[Firestore Delete Fallback]', firestoreErr.message);
      }
    }

    // Fallback local
    const initialLen = memoryTasks.length;
    memoryTasks = memoryTasks.filter(t => !(t.id === id && t.userId === userId));
    if (memoryTasks.length === initialLen) {
      return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
    }
    res.json({ success: true, message: 'Tarefa excluída com sucesso.', id });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 TaskFlow Backend rodando na porta: ${PORT}`);
});
