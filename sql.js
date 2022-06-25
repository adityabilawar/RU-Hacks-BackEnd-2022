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
  connectionString:
    "postgresql://duy:l1wDwh5p9PiQCwvTCjFZBQ@free-tier9.gcp-us-west2.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full&options=--cluster%3Dspotty-gnoll-517",
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
