// better-sqlite3 API shim backed by node:sqlite (DatabaseSync). Lets the real
// electron/db/connection.ts run under plain Node for DB verification without a
// native better-sqlite3 build. Only the API surface used by connection.ts is
// implemented; unknown option objects are tolerated.
import { DatabaseSync } from "node:sqlite";

class Statement {
  constructor(stmt) {
    this._s = stmt;
  }
  get(...params) {
    return this._s.get(...params);
  }
  all(...params) {
    return this._s.all(...params);
  }
  run(...params) {
    const r = this._s.run(...params);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
  iterate(...params) {
    return this._s.iterate(...params);
  }
}

class Database {
  constructor(filename, options) {
    this._db = new DatabaseSync(filename);
    this._db.exec("PRAGMA foreign_keys = ON");
  }
  exec(sql) {
    this._db.exec(sql);
    return this;
  }
  prepare(sql) {
    return new Statement(this._db.prepare(sql));
  }
  pragma(sql, opts) {
    const cleaned = String(sql).replace(/^PRAGMA\s+/i, "");
    return this._db.prepare(`PRAGMA ${cleaned}`).all();
  }
  close() {
    this._db.close();
  }
}

export default Database;
