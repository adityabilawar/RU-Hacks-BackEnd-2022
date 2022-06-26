//START  RUNNING MANUAL SQL

const fs = require("fs");

const Pool = require("pg").Pool;

var queries = fs
  .readFileSync("./database/manual.sql")
  .toString()
  .replace(/(\r\n|\n|\r)/gm, " ") // remove newlines
  .replace(/\s+/g, " ") // excess white space
  .split(";") // split into all statements
  .map(Function.prototype.call, String.prototype.trim)
  .filter(function (el) {
    return el.length != 0;
  });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
(async () => {
  queries.forEach(async (sql) => {
    try {
      const res = await pool.query(sql);
    } catch (error) {
      console.log(error);
    }
    //console.log(res.rows[0].message); // Hello world!
  });
})();

//END RUNNING MANUAL SQL
