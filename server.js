javascript
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lifeboard';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  pushSubscription: { type: Object, default: null },
  emailNotifications: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);

// Reminder Schema
const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  category: { type: String, required: true, enum: ['bills', 'car', 'pets', 'health', 'documents', 'birthdays', 'home', 'subscriptions', 'other'] },
  dueDate: { type: Date, required: true },
  recurring: { type: String, enum: ['none', 'weekly', 'monthly', 'yearly'], default: 'none' },
  notes: { type: String, default: '' },
  funMessage: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  notifiedDays: [{ type: Number }],
  createdAt: { type: Date, default: Date.now }
});

const Reminder = mongoose.model('Reminder', reminderSchema);

// Fun messages by category
const funMessages = {
  bills: [
    "Pay up or lights out! 💡",
    "Your wallet is crying, but so will you if this goes unpaid!",
    "Bill collectors don't accept excuses!",
    "Time to adult - pay this bill!"
  ],
  car: [
    "Your car needs love too! 🚗",
    "No maintenance = expensive repairs later!",
    "Keep your wheels rolling - handle this!",
    "Your car is judging you right now."
  ],
  pets: [
    "Be a good pet parent! 🐾",
    "Your fur baby is counting on you!",
    "Woof! Time to take care of me!",
    "Your pet can't remind you, but I can!"
  ],
  health: [
    "Your body will thank you! 💊",
    "Health first - everything else second!",
    "Future you is begging present you to handle this!",
    "Don't put off what keeps you going!"
  ],
  documents: [
    "Paperwork waits for no one! 📄",
    "Expired docs = big problems!",
    "Bureaucracy doesn't care about your excuses!",
    "Get this done before it becomes a disaster!"
  ],
  birthdays: [
    "Don't be THAT person who forgets! 🎂",
    "Time to show some love!",
    "Forgetting this birthday? Not on my watch!",
    "Be the friend/family member who remembers!"
  ],
  home: [
    "Your home needs attention! 🏠",
    "A little maintenance now saves big bucks later!",
    "Adulting is hard, but so is a broken house!",
    "Your future self will thank you!"
  ],
  subscriptions: [
    "Pay or lose access! 📺",
    "Your binge privileges are at stake!",
    "No payment = no streaming!",
    "Keep the entertainment flowing!"
  ],
  other: [
    "This won't handle itself!",
    "Time to check this off your list!",
    "Don't let this slip through the cracks!",
    "You've got this - just do it!"
  ]
};

function getRandomFunMessage(category) {
  const messages = funMessages[category] || funMessages.other;
  return messages[Math.floor(Math.random() * messages.length)];
}

const JWT_SECRET = pro...RET || 'lifeboard-secret-key-2024';

const authMiddleware = async (req, res, next) => {
  try {
    const token = req...ion?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: has...ord, name });
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reminders', authMiddleware, async (req, res) => {
  try {
    const reminders = await Reminder.find({ userId: req.userId }).sort({ dueDate: 1 });
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reminders', authMiddleware, async (req, res) => {
  try {
    const { title, category, dueDate, recurring, notes } = req.body;
    
    const funMessage = getRandomFunMessage(category);
    
    const reminder = new Reminder({
      userId: req.userId,
      title,
      category,
      dueDate,
      recurring: recurring || 'none',
      notes: notes || '',
      funMessage
    });
    
    await reminder.save();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reminders/:id', authMiddleware, async (req, res) => {
  try {
    const { title, category, dueDate, recurring, notes, completed } = req.body;
    
    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { title, category, dueDate, recurring, notes, completed },
      { new: true }
    );
    
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reminders/:id', authMiddleware, async (req, res) => {
  try {
    const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reminders/:id/complete', authMiddleware, async (req, res) => {
  try {
    const reminder = await Reminder.findOne({ _id: req.params.id, userId: req.userId });
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    
    reminder.completed = true;
    
    if (reminder.recurring !== 'none') {
      const nextDate = new Date(reminder.dueDate);
      if (reminder.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      if (reminder.recurring === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      if (reminder.recurring === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
      
      const newReminder = new Reminder({
        userId: req.userId,
        title: reminder.title,
        category: reminder.category,
        dueDate: nextDate,
        recurring: reminder.recurring,
        notes: reminder.notes,
        funMessage: getRandomFunMessage(reminder.category)
      });
      await newReminder.save();
    }
    
    await reminder.save();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const reminders = await Reminder.find({ userId: req.userId, completed: false });
    
    const overdue = reminders.filter(r => new Date(r.dueDate) < today).length;
    const dueToday = reminders.filter(r => {
      const d = new Date(r.dueDate);
      return d >= today && d < new Date(today.getTime() + 24 * 60 * 60 * 1000);
    }).length;
    const dueThisWeek = reminders.filter(r => {
      const d = new Date(r.dueDate);
      return d >= today && d <= weekFromNow;
    }).length;
    const upcoming = reminders.filter(r => new Date(r.dueDate) > weekFromNow).length;
    
    const rageMeter = Math.min(100, overdue * 25);
    
    res.json({
      total: reminders.length,
      overdue,
      dueToday,
      dueThisWeek,
      upcoming,
      rageMeter
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'LifeBoard', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LifeBoard server running on port ${PORT}`);
});
