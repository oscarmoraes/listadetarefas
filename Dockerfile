# Imagem base oficial Node.js LTS leve
FROM node:20-alpine

# Diretório de trabalho
WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production

# Copiar código fonte da aplicação
COPY . .

# Variável de ambiente de porta para o Cloud Run
ENV PORT=8080
ENV NODE_ENV=production
ENV GCP_PROJECT_ID=listadetarefas-506523

# Expor a porta 8080 (padrão Cloud Run)
EXPOSE 8080

# Iniciar aplicação
CMD [ "npm", "start" ]
