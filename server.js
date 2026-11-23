const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const { Firestore } = require('@google-cloud/firestore');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'listadetarefas-506523';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || PROJECT_ID;

// Inicialização do Firebase Admin SDK (verifica assinaturas JWT com chaves públicas do Google + projectId)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: FIREBASE_PROJECT_ID
  });
}

// Configuração de CORS com lista explícita de origens permitidas
const DEFAULT_ALLOWED_ORIGINS = [
  'https://listadetarefas-app-160309533102.southamerica-east1.run.app',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

const EXTRA_ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...EXTRA_ALLOWED_ORIGINS
]);

const corsOptions = {
  origin(origin, callback) {
    // Permite requisições sem Origin (same-origin, healthchecks, clientes CLI)
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.has(origin)) {
      return callback(null, true);
    }

    // Origem não autorizada: omite Access-Control-Allow-Origin (nunca retorna '*')
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
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

// Middleware de autenticação JWT via Firebase Admin SDK
async function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  const token = match ? match[1].trim() : '';

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Autenticação necessária. Faça login com sua conta Google.'
    });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null
    };
    return next();
  } catch (error) {
    console.warn('[Auth] Falha na verificação do token JWT:', error.code || error.message);
    return res.status(401).json({
      success: false,
      error: 'Token inválido ou expirado. Faça login novamente.'
    });
  }
}

// 1. Healthcheck (público)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    project: PROJECT_ID,
    storageMode: useMemoryFallback ? 'in-memory-fallback' : 'cloud-firestore'
  });
});

// 2. Endpoint de Configuração Segura em Tempo de Execução (público)
app.get('/api/config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${PROJECT_ID}.firebaseapp.com`,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
  });
});

// 3. Listar tarefas do usuário autenticado
app.get('/api/tasks', authenticateRequest, async (req, res) => {
  try {
    const userId = req.user.uid;

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

// 4. Criar nova tarefa associada ao usuário autenticado
app.post('/api/tasks', authenticateRequest, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { title, description = '', priority = 'medium', category = 'Geral', dueDate = null } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ success: false, error: 'O título da tarefa é obrigatório.' });
    }

    const newTask = {
      userId,
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
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

// 5. Atualizar tarefa (valida se pertence ao usuário autenticado)
app.put('/api/tasks/:id', authenticateRequest, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;
    const allowedFields = ['title', 'description', 'priority', 'category', 'dueDate', 'completed'];
    const updates = { updatedAt: new Date().toISOString() };

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        updates[field] = req.body[field];
      }
    }

    if (!useMemoryFallback) {
      try {
        const docRef = db.collection(COLLECTION_NAME).doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
        }

        const data = doc.data();
        if (data.userId !== userId) {
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

// 6. Deletar tarefa (valida se pertence ao usuário autenticado)
app.delete('/api/tasks/:id', authenticateRequest, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    if (!useMemoryFallback) {
      try {
        const docRef = db.collection(COLLECTION_NAME).doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
        }

        const data = doc.data();
        if (data.userId !== userId) {
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
  console.log(`🚀 Lista de Tarefas Backend rodando na porta: ${PORT}`);
});
