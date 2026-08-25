# 📋 Lista de Tarefas (Google Cloud Edition)

Aplicação Serverless de Lista de Tarefas arquitetada para a **Google Cloud Platform (GCP)** com integração ao **Google Cloud Firestore** e hospedagem no **Cloud Run**.

---

## ☁️ Dados do Projeto GCP

- **Nome do Projeto:** `ListaDeTarefas`
- **ID do Projeto:** `listadetarefas-506523`
- **Número do Projeto:** `160309533102`
- **Serviços Ativos:** Cloud Run Admin API, Artifact Registry API, Cloud Firestore API, Secret Manager API.

---

## 📁 Estrutura de Arquivos

```
listadeTarefas/
├── public/
│   ├── index.html         # Frontend Material Design 3 (Google Workspace style)
│   ├── style.css          # Estilização com cores oficiais do Google Cloud
│   └── app.js             # Lógica do cliente, chamadas REST e filtros
├── arquitetura_gcp.html   # Grafo e Dashboard visual da arquitetura GCP
├── server.js              # Backend Node.js Express + Firestore SDK + Fallback
├── package.json           # Dependências e scripts
├── Dockerfile             # Container otimizado para o Cloud Run
├── .dockerignore          # Arquivos excluídos do container
├── deploy-gcp.ps1         # Script de deploy automático via PowerShell
└── README.md              # Documentação
```

---

## 🚀 Como Rodar Localmente

1. No terminal da pasta do projeto, inicie o servidor:
   ```bash
   npm start
   ```
2. Abra no navegador:
   - Aplicação: [http://localhost:8080](http://localhost:8080)
   - Grafo de Arquitetura: [http://localhost:8080/arquitetura_gcp.html](http://localhost:8080/arquitetura_gcp.html)

---

## 🌐 Como Publicar no Google Cloud Run

### Opção 1: Via Google Cloud CLI (`gcloud`)
1. Instale o [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (se ainda não tiver instalado).
2. Faça login e configure o projeto:
   ```bash
   gcloud auth login
   gcloud config set project listadetarefas-506523
   ```
3. Execute o script de deploy automatizado:
   ```powershell
   .\deploy-gcp.ps1
   ```
   ou via comando direto:
   ```bash
   gcloud run deploy listadetarefas-app --source . --region southamerica-east1 --allow-unauthenticated
   ```

### Opção 2: Diretamente pelo Navegador (Google Cloud Console)
1. Acesse [Cloud Run no Console](https://console.cloud.google.com/run?project=listadetarefas-506523).
2. Clique em **Criar Serviço** (Create Service).
3. Selecione a opção **Implantar continuamente a partir de um repositório** (conecte seu GitHub) ou envie a imagem do código.
