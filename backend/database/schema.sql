CREATE DATABASE IF NOT EXISTS avance_frequencia;
USE avance_frequencia;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  usuario VARCHAR(60) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS salas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  turno VARCHAR(30) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alunos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  sala_id INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aluno_sala FOREIGN KEY (sala_id) REFERENCES salas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS frequencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  aluno_id INT NOT NULL,
  sala_id INT NOT NULL,
  data_aula DATE NOT NULL,
  status ENUM('presente', 'falta') NOT NULL,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_freq_aluno FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE,
  CONSTRAINT fk_freq_sala FOREIGN KEY (sala_id) REFERENCES salas(id) ON DELETE CASCADE,
  CONSTRAINT uq_frequencia UNIQUE (aluno_id, data_aula)
);

CREATE TABLE IF NOT EXISTS responsaveis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL,
  telefone VARCHAR(25) NOT NULL,
  aluno_id INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_responsavel_aluno FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE,
  CONSTRAINT uq_responsavel_aluno UNIQUE (email, aluno_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT uq_refresh_usuario UNIQUE (usuario_id)
);

INSERT IGNORE INTO salas (id, nome, turno)
VALUES
  (1, 'Sala 1 - Fundamental', 'Manha'),
  (2, 'Sala 2 - Reforco Matematica', 'Tarde'),
  (3, 'Sala 3 - Linguagens', 'Noite');

INSERT IGNORE INTO alunos (id, nome, sala_id)
VALUES
  (1, 'Ana Clara', 1),
  (2, 'Bruno Silva', 1),
  (3, 'Carlos Henrique', 1),
  (4, 'Daniela Souza', 2),
  (5, 'Eduardo Lima', 2),
  (6, 'Fernanda Rocha', 2),
  (7, 'Gabriel Martins', 3),
  (8, 'Helena Costa', 3),
  (9, 'Igor Nascimento', 3);
