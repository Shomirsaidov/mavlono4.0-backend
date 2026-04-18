const express = require('express');
const router = express.Router();
const supabase = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mavlono_secret_2026';
const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds

// Fetch Authenticated User
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { data: user, error } = await supabase.from('users').select('*').eq('id', decoded.id).single();
        if (error || !user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Register User
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
    
    // Check existing
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(400).json({ error: 'Email already exists.' });
    
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const { data: user, error } = await supabase.from('users').insert([{ name, email, password: hashedPassword }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: maxAge });
    res.json({ user, token });
});

// Login User
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
    
    if (error || !user) return res.status(404).json({ error: 'No accounting matching that email.' });
    
    let isMatch = false;
    if (user.password && user.password.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(password, user.password);
    } else {
        isMatch = (password === user.password); // Fallback for statically injected mock users
    }
    
    if (!isMatch) return res.status(400).json({ error: 'Incorrect password.' });
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: maxAge });
    res.json({ user, token });
});

// Profile logic - replicate user rank and top viewed poems
router.get('/:id', async (req, res) => {
    const userId = req.params.id;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
        
    if (error) return res.status(500).json({ error: error.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Original Laravel grouped views and picked top 5 most viewed poems.
    // For a precise map without Supabase RPC, we group locally. 
    const { data: views } = await supabase
        .from('views')
        .select('poem_id, poem:poems(*, poet:poets(name))')
        .eq('user_id', userId);
        
    let topPoems = [];
    if (views) {
        const counts = {};
        const poemData = {};
        for(let v of views) {
            if(!v.poem_id) continue;
            counts[v.poem_id] = (counts[v.poem_id] || 0) + 1;
            if(!poemData[v.poem_id]) poemData[v.poem_id] = v.poem;
        }
        topPoems = Object.keys(counts)
            .map(id => ({ poem_id: id, views_count: counts[id], poem: poemData[id] }))
            .sort((a,b) => b.views_count - a.views_count)
            .slice(0, 5);
    }
    // Fetch recent 10 poems added by user
    const { data: recentPoems } = await supabase
        .from('poems')
        .select('*, poet:poets(name, avatar), likes(id, user_id), views(id)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

    // Fetch top 5 recent poems user liked
    const { data: likedPoemsData } = await supabase
        .from('likes')
        .select('poem_id, poem:poems(*, poet:poets(name, avatar), likes(id, user_id), views(id))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
        
    const likedPoems = likedPoemsData ? likedPoemsData.map(l => l.poem).filter(Boolean) : [];

    // Fetch top 5 subscribed poets
    // Note: Assuming a 'subscriptions' table links user_id and poet_id based on standard setup
    // Since we noted subscriptions table might not exist we will mock if it fails
    let subscribedPoets = [];
    const { data: subsData, error: subsError } = await supabase
        .from('subscriptions')
        .select('poet:poets(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
        
    if (!subsError && subsData) {
        subscribedPoets = subsData.map(s => s.poet).filter(Boolean);
    }
    
    // Placeholder rank (usually derived from a SQL VIEW)
    const rank = 1;
    res.json({ 
        user, 
        topPoems, // Keep old legacy support if needed
        recentPoems: recentPoems || [],
        likedPoems,
        subscribedPoets,
        rank 
    });
});

module.exports = router;
