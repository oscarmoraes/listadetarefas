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
  /**
   * Valida se a origem da requisição HTTP está autorizada pela política de CORS.
   *
   * @param {string|undefined} origin - Cabeçalho Origin enviado pelo navegador ou cliente.
   * @param {Function} callback - Callback do pacote cors `(err, allow)` que libera ou bloqueia a origem.
   * @returns {void}
   */
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

/**
 * Middleware de autenticação JWT via Firebase Admin SDK.
 * Extrai o token Bearer do cabeçalho Authorization, valida a assinatura e popula `req.user`.
 *
 * @param {import('express').Request} req - Objeto da requisição HTTP.
 * @param {import('express').Response} res - Objeto da resposta HTTP.
 * @param {import('express').NextFunction} next - Função para avançar ao próximo middleware ou rota.
 * @returns {Promise<void>}
 */
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

/**
 * Rota pública de healthcheck para monitoramento do serviço e verificação do modo de armazenamento.
 *
 * @param {import('express').Request} req - Objeto da requisição HTTP.
 * @param {import('express').Response} res - Objeto da resposta HTTP.
 * @returns {void}
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    project: PROJECT_ID,
    storageMode: useMemoryFallback ? 'in-memory-fallback' : 'cloud-firestore'
  });
});

/**
 * Rota pública que fornece as configurações do Firebase Web SDK em tempo de execução.
 * Evita expor chaves hardcoded no código-fonte do frontend.
 *
 * @param {import('express').Request} req - Objeto da requisição HTTP.
 * @param {import('express').Response} res - Objeto da resposta HTTP.
 * @returns {void}
 */
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

/**
 * Lista todas as tarefas pertencentes ao usuário autenticado, ordenadas da mais recente para a mais antiga.
 * Usa o Firestore como armazenamento principal e recorre à memória local em caso de falha ou modo offline.
 *
 * @param {import('express').Request} req - Requisição HTTP contendo `req.user.uid`.
 * @param {import('express').Response} res - Resposta HTTP com a lista de tarefas.
 * @returns {Promise<void>}
 */
app.get('/api/tasks', authenticateRequest, async (req, res) => {
  try {
    const userId = req.user.uid;

    if (!useMemoryFallback) {
      try {
        const snapshot = await db.collection(COLLECTION_NAME)
          .where('userId', '==', userId)
          .get();

        // Converte os documentos do Firestore incluindo o ID gerado no objeto final
        const tasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Ordenar por data de criação decrescente (evita necessidade de índice composto no Firestore)
        tasks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        return res.json({ success: true, count: tasks.length, data: tasks });
      } catch (firestoreErr) {
        console.warn('[Firestore Query Fallback]', firestoreErr.message);
      }
    }

    // Fallback local: filtra tarefas em memória pertencentes ao usuário atual
    const userTasks = memoryTasks.filter(t => t.userId === userId);
    return res.json({ success: true, count: userTasks.length, data: userTasks });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Cria uma nova tarefa vinculada ao `uid` do usuário autenticado.
 * Valida a obrigatoriedade do título antes de persistir no Firestore ou no fallback em memória.
 *
 * @param {import('express').Request} req - Requisição HTTP contendo os dados da tarefa no corpo (`req.body`).
 * @param {import('express').Response} res - Resposta HTTP com status 201 e a tarefa criada.
 * @returns {Promise<void>}
 */
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

/**
 * Atualiza parcialmente uma tarefa existente após verificar que ela pertence ao usuário autenticado.
 * Aplica uma lista explícita de campos permitidos para evitar sobrescrita de `userId` ou `createdAt`.
 *
 * @param {import('express').Request} req - Requisição HTTP com parâmetro `id` e campos a atualizar em `req.body`.
 * @param {import('express').Response} res - Resposta HTTP com a tarefa atualizada ou erro 403/404.
 * @returns {Promise<void>}
 */
app.put('/api/tasks/:id', authenticateRequest, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;
    const allowedFields = ['title', 'description', 'priority', 'category', 'dueDate', 'completed'];
    const updates = { updatedAt: new Date().toISOString() };

    // Copia apenas os campos permitidos presentes no corpo da requisição
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

    // Fallback local: localiza a tarefa pelo ID e valida posse pelo userId
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

/**
 * Exclui uma tarefa específica após validar que o documento pertence ao usuário autenticado.
 *
 * @param {import('express').Request} req - Requisição HTTP contendo o parâmetro `id` da tarefa.
 * @param {import('express').Response} res - Resposta HTTP confirmando a exclusão ou erro 403/404.
 * @returns {Promise<void>}
 */
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

    // Fallback local: remove apenas se o ID e o userId corresponderem
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

/**
 * Inicializa o servidor HTTP na porta configurada e exibe o log de inicialização.
 */
app.listen(PORT, () => {
  console.log(`🚀 Lista de Tarefas Backend rodando na porta: ${PORT}`);
});
