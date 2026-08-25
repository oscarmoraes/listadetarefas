<#
  Script de Deploy Automático para o Google Cloud Run
  Projeto: ListaDeTarefas
  Project ID: listadetarefas-506523
#>

$PROJECT_ID = "listadetarefas-506523"
$SERVICE_NAME = "listadetarefas-app"
$REGION = "southamerica-east1" # São Paulo (ou use 'us-central1' para Free Tier internacional)

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "🚀 Iniciando Deploy no Google Cloud Run" -ForegroundColor Green
Write-Host "📦 Projeto: $PROJECT_ID" -ForegroundColor Yellow
Write-Host "🌐 Região: $REGION" -ForegroundColor Yellow
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Definir projeto no gcloud
Write-Host "`n[1/3] Configurando o projeto no gcloud..." -ForegroundColor White
gcloud config set project $PROJECT_ID

# 2. Fazer Build e Deploy no Cloud Run com um único comando
Write-Host "`n[2/3] Enviando container para o Cloud Build e Cloud Run..." -ForegroundColor White
$envVars = "GCP_PROJECT_ID=$PROJECT_ID,NODE_ENV=production," + `
           "FIREBASE_API_KEY=AIzaSyB1lqfiwCSEWXI_HCj9NYincrbqtVum8T8," + `
           "FIREBASE_AUTH_DOMAIN=listadetarefas-506523.firebaseapp.com," + `
           "FIREBASE_PROJECT_ID=listadetarefas-506523," + `
           "FIREBASE_STORAGE_BUCKET=listadetarefas-506523.firebasestorage.app," + `
           "FIREBASE_MESSAGING_SENDER_ID=160309533102," + `
           "FIREBASE_APP_ID=1:160309533102:web:2bffd8ce67ff4248e0503f," + `
           "FIREBASE_MEASUREMENT_ID=G-81QNH5JKW4"

gcloud run deploy $SERVICE_NAME `
    --source . `
    --region $REGION `
    --allow-unauthenticated `
    --set-env-vars=$envVars

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=================================================" -ForegroundColor Green
    Write-Host "🎉 Aplicação publicada com sucesso no Google Cloud!" -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Green
} else {
    Write-Host "`n❌ Ocorreu um erro durante o deploy. Verifique se o gcloud CLI está instalado e autenticado (gcloud auth login)." -ForegroundColor Red
}
