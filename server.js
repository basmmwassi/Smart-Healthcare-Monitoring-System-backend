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
  res.setHeader('Vary', 'Origin')

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

  if (req.method === 'OPTIONS') return res.sendStatus(204)
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









const patientSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    deviceId: { type: String, default: null }
  },
  { timestamps: true }
)

const Patient = mongoose.model('Patient', patientSchema)

const latestReadingSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, unique: true, index: true },
    patientName: { type: String, required: true },

    vitals: {
      heartRate: { type: Number, default: null },
      spo2: { type: Number, default: null },
      temperature: { type: Number, default: null },
      fallDetected: { type: Boolean, default: null }
    },

    severityReport: {
      heartRate: { type: String, default: 'INFO' },
      spo2: { type: String, default: 'INFO' },
      temperature: { type: String, default: 'INFO' },
      fallMotion: { type: String, default: 'INFO' }
    },

    finalSeverity: { type: String, default: 'NORMAL', index: true },
    alertActive: { type: Boolean, default: false, index: true },
    message: { type: String, default: '' },
    timestamp: { type: Date, required: true, index: true }
  },
  { timestamps: true }
)

const LatestReading = mongoose.model('LatestReading', latestReadingSchema)

const readingHistorySchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, index: true },
    vitals: {
      heartRate: { type: Number, default: null },
      spo2: { type: Number, default: null },
      temperature: { type: Number, default: null },
      fallDetected: { type: Boolean, default: null }
    },
    finalSeverity: { type: String, default: 'NORMAL', index: true },
    timestamp: { type: Date, required: true, index: true }
  },
  { timestamps: true }
)

readingHistorySchema.index({ patientId: 1, timestamp: -1 })

const ReadingHistory = mongoose.model('ReadingHistory', readingHistorySchema)

const alertSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, index: true },
    severity: { type: String, required: true, index: true },
    message: { type: String, default: '' },
    timestamp: { type: Date, required: true, index: true }
  },
  { timestamps: true }
)

alertSchema.index({ patientId: 1, timestamp: -1 })

const Alert = mongoose.model('Alert', alertSchema)

function normalizeSeverity(s) {
  const x = String(s || '').toUpperCase()
  if (x === 'CRITICAL' || x === 'WARNING' || x === 'INFO' || x === 'NORMAL') return x
  return 'INFO'
}

function ingestAuth(req, res, next) {
  const expected = process.env.INGEST_API_KEY
  if (!expected) return next()
  const got = req.headers['x-api-key']
  if (!got || String(got) !== String(expected)) return res.status(401).json({ message: 'Unauthorized' })
  next()
}


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





app.post('/api/ingest/readings', ingestAuth, async (req, res) => {
  try {
    const body = req.body || {}

    const patientId = String(body.patientId || '').trim()
    const patientName = String(body.patientName || body.name || '').trim()

    if (!patientId || !patientName) {
      return res.status(400).json({ message: 'Missing patientId or patientName' })
    }

    const vitals = body.vitals || {}
    const severityReport = body.severityReport || {}

    const timestampRaw = body.timestamp
    const timestamp = timestampRaw ? new Date(timestampRaw) : new Date()
    if (Number.isNaN(timestamp.getTime())) return res.status(400).json({ message: 'Invalid timestamp' })

    const finalSeverity = normalizeSeverity(body.finalSeverity || 'NORMAL')
    const alertActive = Boolean(body.alertActive)
    const message = String(body.message || '')

    await Patient.updateOne(
      { patientId },
      { $setOnInsert: { patientId, name: patientName } },
      { upsert: true }
    )

    await LatestReading.updateOne(
      { patientId },
      {
        $set: {
          patientId,
          patientName,
          vitals: {
            heartRate: vitals.heartRate ?? null,
            spo2: vitals.spo2 ?? null,
            temperature: vitals.temperature ?? null,
            fallDetected: vitals.fallDetected ?? null
          },
          severityReport: {
            heartRate: normalizeSeverity(severityReport.heartRate),
            spo2: normalizeSeverity(severityReport.spo2),
            temperature: normalizeSeverity(severityReport.temperature),
            fallMotion: normalizeSeverity(severityReport.fallMotion)
          },
          finalSeverity,
          alertActive,
          message,
          timestamp
        }
      },
      { upsert: true }
    )

    await ReadingHistory.create({
      patientId,
      vitals: {
        heartRate: vitals.heartRate ?? null,
        spo2: vitals.spo2 ?? null,
        temperature: vitals.temperature ?? null,
        fallDetected: vitals.fallDetected ?? null
      },
      finalSeverity,
      timestamp
    })

    const isAlert = alertActive || finalSeverity === 'WARNING' || finalSeverity === 'CRITICAL' || Boolean(message)
    if (isAlert) {
      await Alert.create({
        patientId,
        severity: finalSeverity === 'NORMAL' && alertActive ? 'CRITICAL' : finalSeverity,
        message: message || 'Alert',
        timestamp
      })
    }

    res.json({ ok: true })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/dashboard/patients', auth, async (req, res) => {
  try {
    const onlyWarnings = String(req.query.onlyWarnings || '').toLowerCase() === 'true'

    const filter = {}
    if (onlyWarnings) {
      filter.$or = [
        { finalSeverity: { $in: ['WARNING', 'CRITICAL'] } },
        { alertActive: true }
      ]
    }

    const patients = await LatestReading.find(filter).sort({ timestamp: -1 }).lean()
    res.json({ patients })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/patients/:patientId/latest', auth, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || '').trim()
    const latest = await LatestReading.findOne({ patientId }).lean()
    if (!latest) return res.status(404).json({ message: 'Not found' })
    res.json({ latest })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/patients/:patientId/history', auth, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || '').trim()
    const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10), 1), 2000)
    const history = await ReadingHistory.find({ patientId }).sort({ timestamp: -1 }).limit(limit).lean()
    res.json({ history })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/patients/:patientId/alerts', auth, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || '').trim()
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 2000)
    const alerts = await Alert.find({ patientId }).sort({ timestamp: -1 }).limit(limit).lean()
    res.json({ alerts })
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
