const sqlite3 = require("sqlite3").verbose()

const db = new sqlite3.Database("./database.db")

db.serialize(() => {

  // tạo table
  db.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      speed REAL,
      grip REAL,
      open REAL,
      wait REAL
    )
  `)

  // seed data
  db.run(`
    INSERT INTO recipes (name,speed,grip,open,wait)
    VALUES
    ("測試配方一",100,30,80,2.5),
    ("測試配方_1",120,40,90,3),
    ("高速配方 A",200,25,70,1.5),
    ("精密配方 B",60,20,50,3.5)
  `)

})

db.close()

console.log("Database seeded")