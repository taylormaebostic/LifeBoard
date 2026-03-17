Go to github.com/taylormaebostic/LifeBoard
Click on server.js
Click the pencil icon (Edit) ✏️
Delete EVERYTHING
Paste this entire code:
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lifeboard';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  dueDate: { type: Date, required: true },
  recurring: { type: String, default: 'none' },
  notes: { type: String, default: '' },
  funMessage: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Reminder = mongoose.model('Reminder', reminderSchema);

const funMessages = {
  bills: ["Pay up or lights out!", "Time to adult - pay this bill!"],
  car: ["Your car needs love too!", "Keep your wheels rolling!"],
  pets: ["Be a good pet parent!", "Your fur baby is counting on you!"],
  health: ["Your body will thank you!", "Health first!"],
  documents: ["Paperwork waits for no one!", "Get this done!"],
  birthdays: ["Don't forget this birthday!", "Time to show some love!"],
  home: ["Your home needs attention!", "Adulting is hard!"],
  subscriptions: ["Pay or lose access!", "Keep the entertainment flowing!"],
  other: ["This won't handle itself!", "You've got this!"]
};

function getRandomFunMessage(category) {
  const messages = funMessages[category] || funMessages.other;
  return messages[Math.floor(Math.random() * messages.length)];
}

const JWT_SECRET = process.env.JWT_SECRET || 'lifeboard-secret-key-2024';

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
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
    const user = new User({ email, password: hashedPassword, name });
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
      userId: req.userId, title, category, dueDate,
      recurring: recurring || 'none', notes: notes || '', funMessage
    });
    await reminder.save();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reminders/:id', authMiddleware, async (req, res) => {
  try {
    await Reminder.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reminders/:id/complete', authMiddleware, async (req, res) => {
  try {
    const reminder = await Reminder.findOne({ _id: req.params.id, userId: req.userId });
    if (!reminder) return res.status(404).json({ error: 'Not found' });
    reminder.completed = true;
    await reminder.save();
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const reminders = await Reminder.find({ userId: req.userId, completed: false });
    const overdue = reminders.filter(r => new Date(r.dueDate) < today).length;
    const dueToday = reminders.filter(r => {
      const d = new Date(r.dueDate);
      return d >= today && d < new Date(today.getTime() + 86400000);
    }).length;
    const dueThisWeek = reminders.filter(r => {
      const d = new Date(r.dueDate);
      return d >= today && d <= weekFromNow;
    }).length;
    const upcoming = reminders.filter(r => new Date(r.dueDate) > weekFromNow).length;
    res.json({ total: reminders.length, overdue, dueToday, dueThisWeek, upcoming, rageMeter: Math.min(100, overdue * 25) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'LifeBoard' });
});

app.get('*', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('LifeBoard server running on port ' + PORT);
});
