// config/database.js
// Simple JSON-file database stored in /encrypted/users.json
const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'encrypted', 'users.json');

// ── Helpers ───────────────────────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── User queries ──────────────────────────────────────────────────
function findByUsername(username) {
  return readDB().users.find(u => u.username === username) || null;
}

function findById(id) {
  return readDB().users.find(u => u.id === id) || null;
}

function createUser(userData) {
  const db = readDB();
  db.users.push(userData);
  writeDB(db);
  return userData;
}

function updateUserFiles(username, files) {
  const db  = readDB();
  const idx = db.users.findIndex(u => u.username === username);
  if (idx === -1) return false;
  db.users[idx].files = files;
  writeDB(db);
  return true;
}

function getUserFiles(username) {
  const user = findByUsername(username);
  return user ? (user.files || []) : [];
}

module.exports = {
  readDB, writeDB,
  findByUsername, findById,
  createUser, updateUserFiles, getUserFiles
};