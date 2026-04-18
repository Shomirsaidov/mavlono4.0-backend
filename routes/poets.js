const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { uploadToCloudinary } = require('../utils/cloudinaryUtils');

// Get all poets
router.get('/', async (req, res) => {
    const { data: poets, error } = await supabase
        .from('poets')
        .select('*')
        .order('name', { ascending: true });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(poets);
});

// Create poet
router.post('/', async (req, res) => {
    let { name, category, avatar, lifetime, bio } = req.body;
    
    // Handle Cloudinary Upload if Base64
    if (avatar && avatar.startsWith('data:image')) {
        try {
            const result = await uploadToCloudinary(avatar, { folder: 'mavlono/poets' });
            avatar = result.url;
        } catch (err) {
            console.error('Cloudinary Upload Error:', err);
            // Non-blocking but good to log
        }
    }

    const { data: poet, error } = await supabase
        .from('poets')
        .insert({ name, category, avatar, lifetime, bio })
        .select()
        .single();
        
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(poet);
});

// Update poet
router.patch('/:id', async (req, res) => {
    let { name, category, avatar, lifetime, bio } = req.body;
    
    // Handle Cloudinary Upload if Base64
    if (avatar && avatar.startsWith('data:image')) {
        try {
            const result = await uploadToCloudinary(avatar, { folder: 'mavlono/poets' });
            avatar = result.url;
        } catch (err) {
            console.error('Cloudinary Upload Error:', err);
        }
    }

    const { data: poet, error } = await supabase
        .from('poets')
        .update({ name, category, avatar, lifetime, bio })
        .eq('id', req.params.id)
        .select()
        .single();
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(poet);
});

// Delete poet
router.delete('/:id', async (req, res) => {
    const { error } = await supabase
        .from('poets')
        .delete()
        .eq('id', req.params.id);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// Get single poet details
router.get('/:id', async (req, res) => {
    const { data: poet, error } = await supabase
        .from('poets')
        .select('*, subscriptions(*)')
        .eq('id', req.params.id)
        .single();
        
    if (error) return res.status(500).json({ error: error.message });
    if (!poet) return res.status(404).json({ error: 'Poet not found' });
    
    const { data: poems } = await supabase
        .from('poems')
        .select('*, likes(*), views(*)')
        .eq('poet_id', poet.id)
        .order('created_at', { ascending: false });
        
    res.json({ poet, poems: poems || [] });
});

// Subscribe to a poet
router.post('/:id/subscribe', async (req, res) => {
    const { user_id } = req.body;
    
    const { error } = await supabase
        .from('subscriptions')
        .insert({ poet_id: req.params.id, user_id });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: 'success' });
});

module.exports = router;
