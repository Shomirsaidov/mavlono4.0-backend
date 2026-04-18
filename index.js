require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
    cloud_name: 'dlmnievol',
    api_key: '365173165178178',
    api_secret: 'RHw8S9slXFHNEzxvKKltYiCgfnE',
    secure: true,
});

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Prevent browser caching API responses (avoids 304 stale cache issues)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Routes
app.use('/api/poems', require('./routes/poems'));
app.use('/api/poets', require('./routes/poets'));
app.use('/api/users', require('./routes/users'));
app.use('/api/ai', require('./routes/ai'));

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD || 'mavlono2026';
    
    if (password === adminPass) {
        // Return a simple session token (in a real app, use JWT)
        res.json({ token: 'mavlono_admin_session_valid_2026', success: true });
    } else {
        res.status(401).json({ error: 'Пароли нодуруст!' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'Platform API running seamlessly.' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api/')) {
            res.sendFile(path.join(__dirname, '../client/dist/index.html'));
        }
    });
}

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
