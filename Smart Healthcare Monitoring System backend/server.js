require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

/** ✅ CORS (واحد فقط، واضح) */
const corsOptions = {
  origin: 'https://smarthealthcare.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // مهم للـ preflight
app.use(express.json());

/** ✅ Routes */
app.get('/', (req, res) => {
  res.send('Smart Healthcare Backend is running');
});

app.get('/ping', (req, res) => {
  res.json({ ok: true });
});

/** ✅ Start once */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
