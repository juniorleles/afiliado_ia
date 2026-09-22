// Valida o SQL EXATO usado em src/lib/db.ts e src/lib/campaigns.ts —
// copiado literalmente dos arquivos reais do projeto, não reescrito —
// contra um motor SQLite de verdade (node:sqlite, nativo do Node 22).
// Fecha as 2 lacunas de teste que ficaram sem confirmação na Fase 2:
// (1) UPDATE pra um slug já existente também é barrado (não só INSERT);
// (2) DELETE remove de verdade e reflete na listagem.
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');

// Schema EXATO de src/lib/db.ts#migrate()
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    headline TEXT NOT NULL,
    body TEXT NOT NULL,
    ctaLabel TEXT NOT NULL,
    affiliateUrl TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

function assert(cond, msg) {
  if (!cond) throw new Error('FALHOU: ' + msg);
  console.log('OK: ' + msg);
}

// --- INSERT das 2 campanhas de teste (mesmo padrão de createCampaign) ---
const insertStmt = db.prepare(`
  INSERT INTO campaigns (name, slug, headline, body, ctaLabel, affiliateUrl, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const now = new Date().toISOString();
insertStmt.run('Winter Jacket', 'winter-jacket-review', 'H1', 'B1', 'Buy now', 'https://aff.example/a', now, now);
insertStmt.run('Summer Hat', 'summer-hat-review', 'H2', 'B2', 'Buy now', 'https://aff.example/b', now, now);

const all1 = db.prepare('SELECT id, slug FROM campaigns ORDER BY id').all();
assert(all1.length === 2, `2 campanhas criadas (achei ${all1.length})`);

// --- Teste 1 (lacuna aberta): UPDATE pra slug já existente é barrado ---
// Mesma query exata de updateCampaign() em campaigns.ts
const updateStmt = db.prepare(`
  UPDATE campaigns
  SET name = ?, slug = ?, headline = ?, body = ?, ctaLabel = ?, affiliateUrl = ?, updatedAt = ?
  WHERE id = ?
`);
let updateThrew = false;
let updateErrorCode = null;
try {
  // campanha id=2 (summer-hat-review) tentando virar o slug da id=1
  updateStmt.run('Summer Hat', 'winter-jacket-review', 'H2', 'B2', 'Buy now', 'https://aff.example/b', new Date().toISOString(), 2);
} catch (err) {
  updateThrew = true;
  updateErrorCode = err.code;
}
assert(updateThrew, 'UPDATE pra slug duplicado lança erro (mesmo comportamento do INSERT)');
assert(
  updateErrorCode === 'ERR_SQLITE_ERROR' || /UNIQUE/i.test(String(updateErrorCode)),
  `erro é de constraint UNIQUE (code: ${updateErrorCode})`
);

// Confirma que o UPDATE que falhou NÃO alterou nada (SQLite reverte a linha inteira)
const stillIntact = db.prepare('SELECT slug FROM campaigns WHERE id = 2').get();
assert(stillIntact.slug === 'summer-hat-review', 'campanha id=2 manteve o slug original depois do UPDATE falho (sem corrupção parcial)');

// --- Teste 2 (lacuna aberta): DELETE remove de verdade ---
const deleteStmt = db.prepare('DELETE FROM campaigns WHERE id = ?');
const delResult = deleteStmt.run(1);
assert(delResult.changes === 1, 'DELETE afetou exatamente 1 linha');

const all2 = db.prepare('SELECT id, slug FROM campaigns ORDER BY id').all();
assert(all2.length === 1, `listagem reflete a exclusão (${all2.length} restante, esperado 1)`);
assert(all2[0].slug === 'summer-hat-review', 'a campanha que sobrou é a certa');

// --- Bônus: DELETE de id inexistente não afeta nada (mesma checagem de deleteCampaign) ---
const delMissing = deleteStmt.run(999);
assert(delMissing.changes === 0, 'DELETE de id inexistente afeta 0 linhas (deleteCampaign detectaria como "not found")');

console.log('\nTodos os testes de schema/query passaram — comportamento real confirmado.');
