const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');

const pool = new Pool({
  user: 'ulanagusar',
  host: 'localhost',
  database: 'curtains_shop',
  password: '2006Uliana',
  port: 5433,
});

const app = express();
const PORT = 5666;


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, 'yourSecretKey', { expiresIn: '24h' });
    res.status(201).json({ token, userId: user.id, username: user.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ userId: user.id }, 'yourSecretKey', { expiresIn: '24h' });
        res.json({ token, userId: user.id, username: user.username });
      } else {
        res.status(401).send('Password is incorrect');
      }
    } else {
      res.status(404).send('User not found');
    }
  } catch (error) {
    res.status(500).send('Server error');
  }
});


app.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/products', upload.single('image'), async (req, res) => {
    if (!req.file || !req.body.description || !req.body.price || !req.body.category) {
      return res.status(400).send('Missing required fields');
    }
  
    const { description, price, category } = req.body;
    const image = req.file.filename;  
  
    try {
      const result = await pool.query(
        'INSERT INTO products (description, image, price, category) VALUES ($1, $2, $3, $4) RETURNING *',
        [description, image, price, category]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Database error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  

app.post('/add-to-cart', async (req, res) => {
    const { user_id, product_id } = req.body;
    try {
      const result = await pool.query(
        'INSERT INTO user_products (user_id, product_id) VALUES ($1, $2) RETURNING *',
        [user_id, product_id]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Database error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
app.get('/cart/:userId', async (req, res) => {
    const { userId } = req.params;
  
    if (!userId) {
      return res.status(400).send('User ID is required');
    }
  
    try {
      const result = await pool.query(
        'SELECT p.* FROM products p INNER JOIN user_products up ON p.id = up.product_id WHERE up.user_id = $1',
        [userId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Database error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
app.delete('/cart/:userId/:productId', async (req, res) => {
    const { userId, productId } = req.params;
  
    try {
      const result = await pool.query(
        `DELETE FROM user_products
        WHERE ctid IN (
          SELECT ctid
          FROM (
            SELECT ctid, ROW_NUMBER() OVER () as row_num
            FROM user_products
            WHERE user_id = $1 AND product_id = $2
          ) as numbered_rows
          WHERE row_num = 1
        )`,
        [userId, productId]
      );
      if (result.rowCount > 0) {
        res.status(200).json({ message: 'Product removed from cart' });
      } else {
        res.status(404).send('Product not found in cart');
      }
    } catch (error) {
      console.error('Database error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
