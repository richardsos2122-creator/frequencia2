# Sistema de Frequencia - Avance

Sistema web para controle de frequencia de alunos do apoio escolar **Avance**.
(Meu primeiro projeto)

## Tecnologias

- Frontend: HTML, CSS e JavaScript
- Backend: Node.js + Express
- Banco de dados: MySQL

## Estrutura

```
backend/
	config/
	database/
		schema.sql
	routes/
	server.js
frontend/
	assets/
		css/
		js/
	login.html
	register.html
	forgot.html
	dashboard.html
	sala.html
```

## Funcionalidades

1. Tela de Login
- Logo no topo
- Campo usuario
- Campo senha
- Botao entrar
- Link "esqueci a senha"
- Link "novo usuario"

2. Tela Inicial
- Lista de salas em cards
- Clique no card abre a sala
- Botao "Novo usuario" com toggle para cadastrar responsavel (nome, email, aluno e telefone)

3. Tela da Sala
- Lista de alunos da sala
- Marcacao de Presente/Falta por aluno
- Botao para salvar frequencia

## API

Base URL: http://localhost:3000/api

Rotas protegidas exigem header:

Authorization: Bearer SEU_TOKEN

1. Autenticacao
- POST /auth/register
	- body: { "nome": "Nome", "usuario": "login", "senha": "123456" }
- POST /auth/login
	- body: { "usuario": "login", "senha": "123456" }
	- response inclui: token, refreshToken e dados do usuario
- POST /auth/forgot-password
	- body: { "usuario": "login" }
- POST /auth/refresh
	- body: { "refreshToken": "..." }
	- response inclui novo token e novo refreshToken
- POST /auth/logout
	- body: { "refreshToken": "..." }

2. Salas
- GET /salas
- GET /salas/:salaId/alunos

3. Frequencia
- POST /frequencia
	- body:
		{
			"salaId": 1,
			"data": "2026-03-21",
			"registros": [
				{ "alunoId": 1, "status": "presente" },
				{ "alunoId": 2, "status": "falta" }
			]
		}
- GET /frequencia/sala/:salaId/data/:data
- GET /frequencia/sala/:salaId/historico?inicio=2026-03-01&fim=2026-03-31

4. Responsaveis
- GET /responsaveis/alunos
- GET /responsaveis/aluno/:alunoId
- POST /responsaveis
	- body: { "nomeResponsavel": "Nome", "email": "mail@dominio.com", "nomeAluno": "Ana Clara", "telefone": "(11)99999-9999" }

## Colecao de testes da API

Arquivo pronto para teste manual de endpoints:

- backend/requests/frequencia-api.http

Fluxo recomendado:

1. Execute o login no arquivo .http
2. Copie o token retornado
3. Cole na variavel @token
4. Rode as requisicoes protegidas

## Como executar

1. Instale as dependencias:

```bash
npm install
```

2. Configure o `.env` (copie de `.env.example`):

```env
PORT=3000
FRONTEND_ORIGIN=http://localhost:3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=avance_frequencia
DB_PORT=3306
JWT_SECRET=gere-uma-chave-aleatoria-com-pelo-menos-32-caracteres
JWT_EXPIRES_IN=8h
JWT_REFRESH_SECRET=gere-outra-chave-aleatoria-diferente-com-pelo-menos-32-caracteres
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12
```

> O arquivo `.env` está ignorado pelo Git e não será enviado ao GitHub.
> `FRONTEND_ORIGIN` define qual origem pode acessar a API via CORS.

3. Crie o banco e as tabelas no MySQL executando:

```sql
SOURCE backend/database/schema.sql;
```

4. Rode o servidor:

```bash
npm start
```

Para desenvolvimento com recarga automatica:

```bash
npm run dev:server
```

5. Abra no navegador:

```text
http://localhost:3000
```

## Primeiro acesso

- Use a tela de cadastro para criar o primeiro usuario.
- Evite contas padrao ou senhas previsiveis em ambiente real.
