require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const app = express()

const allowedOrigins = new Set([
  'https://smarthealthcare.netlify.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
])

app.use((req, res, next) => {
  const origin = req.headers.origin

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  next()
})

app.use(express.json())

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
)

const User = mongoose.model('User', userSchema)

function signToken(userId) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('Missing JWT_SECRET')
  return jwt.sign({ sub: userId }, secret, { expiresIn: '7d' })
}

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const parts = header.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Unauthorized' })
  try {
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET)
    req.userId = payload.sub
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

app.get('/ping', (req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' })
    if (String(password).length < 6) return res.status(400).json({ message: 'Password too short' })

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() })
    if (existing) return res.status(409).json({ message: 'Email already exists' })

    const passwordHash = await bcrypt.hash(String(password), 12)
    const user = await User.create({ email: String(email).toLowerCase().trim(), passwordHash })
    const token = signToken(user._id.toString())

    res.status(201).json({ message: 'Signup success', token, user: { id: user._id, email: user.email } })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' })

    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })

    const ok = await bcrypt.compare(String(password), user.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    const token = signToken(user._id.toString())
    res.json({ message: 'Login success', token, user: { id: user._id, email: user.email } })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('_id email')
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ user: { id: user._id, email: user.email } })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/', (req, res) => {
  res.send('Smart Healthcare Backend is running')
})

const PORT = process.env.PORT || 5000

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT)
  })
  .catch(err => {
    console.error(err.message)
  })
