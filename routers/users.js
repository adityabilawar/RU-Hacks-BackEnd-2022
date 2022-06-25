const express = require("express");
const _ = require("lodash");
const router = express.Router();

//CockroachDB
const Pool = require("pg").Pool;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// User ROUTE
router.get("/", (req, res) => {
  pool.query("SELECT * FROM users ORDER BY id ASC", (error, results) => {
    if (error) {
      throw error;
    }
    res.status(200).json(results.rows);
  });
});

// GET USER BY ID
router.get("/:id", (req, res) => {
  pool.query(
    "SELECT * FROM users WHERE id = $1",
    [req.params.id],
    (error, results) => {
      if (error) {
        throw error;
      }
      res.status(200).send(results.rows);
    }
  );
});

// LOGIN USER
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  pool.query(
    "SELECT * FROM users WHERE username = $1 AND password = $2",
    [username, password],
    (error, results) => {
      if (error) {
        throw error;
      }
      if (results.rows && results.rows.length > 0) {
        res.status(200).send(results.rows[0]);
      } else {
        res.status(404).send({ error: "Invalid username or password" });
      }
    }
  );
});

// REGISTER
router.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (_.isEmpty(username)) {
    return res.status(404).send({
      username: "Please enter a username",
    });
  }
  if (_.isEmpty(password)) {
    return res.status(404).send({
      password: "Please enter a password",
    });
  }
  // UPDATE
  pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username],
    (error, results) => {
      if (error) {
        throw error;
      }

      if (results.rows && results.rows.length > 0) {
        return res.status(404).send({
          username: "Username already exists",
        });
      } else {
        pool.query(
          "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *",
          [username, password],
          (error, results) => {
            if (error) {
              throw error;
            }
            return res.status(200).send(results.rows[0]);
          }
        );
      }
    }
  );
});

router.get("/delete/:id", (req, res) => {
  const id = parseInt(req.params.id);

  pool.query("DELETE FROM users WHERE id = $1", [id], (error, results) => {
    if (error) {
      throw error;
    }
    res.status(200).send(`User deleted with ID: ${id}`);
  });
});

module.exports = router;
