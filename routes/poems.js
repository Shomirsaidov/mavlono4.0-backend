const express = require('express');
const router = express.Router();
const supabase = require('../db');

// Metadata for filters
router.get('/filters/metadata', async (req, res) => {
    try {
        const { data: poets } = await supabase.from('poets').select('id, name').order('name');
        const { data: poems } = await supabase.from('poems').select('genre, tags');
        
        const genres = [...new Set(poems.map(p => p.genre).filter(Boolean))].sort();
        
        const tagCounts = {};
        poems.forEach(p => {
            if (p.tags) {
                p.tags.split(',').forEach(t => {
                    const tag = t.trim().toLowerCase();
                    if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });
        const popularTags = Object.entries(tagCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 30)
            .map(([tag]) => tag);

        res.json({ poets, genres, tags: popularTags });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get recent poems
router.get('/recent', async (req, res) => {
    console.log('FETCHING RECENT POEMS');
    const { data: poems, error } = await supabase
        .from('poems')
        .select(`
            *,
            poet:poets (id, name, category, avatar, lifetime, bio),
            user:users (name, email),
            likes (id, user_id)
        `)
        .order('created_at', { ascending: false })
        .limit(30);
        
    if (error) {
        console.error('SUPABASE ERROR:', error);
        return res.status(500).json({ error: error.message });
    }
    
    // Convert to shuffled array to mimic the old implementation: 
    // "shuffle($allPoemsArray);"
    const shuffled = poems.sort(() => 0.5 - Math.random());
    res.json(shuffled);
});

// Get popular tags
router.get('/tags/popular', async (req, res) => {
    // Fetch only the tags column to minimize data transfer
    const { data, error } = await supabase
        .from('poems')
        .select('tags')
        .not('tags', 'is', null);

    if (error) return res.status(500).json({ error: error.message });

    const tagCounts = {};
    data.forEach(p => {
        if (p.tags) {
            p.tags.split(',').forEach(t => {
                const tag = t.trim().toLowerCase();
                if (tag) {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                }
            });
        }
    });

    const popularTags = Object.entries(tagCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([tag]) => tag);

    res.json(popularTags);
});

// Search poems
router.get('/search', async (req, res) => {
    const query = req.query.query;
    if (!query) return res.status(400).json({ error: 'Query is required' });
    
    // First, find if this query matches any poet
    const { data: matchedPoets } = await supabase
        .from('poets')
        .select('id')
        .ilike('name', `%${query}%`);
        
    const poetIds = matchedPoets && matchedPoets.length ? matchedPoets.map(p => p.id) : [];

    // Construct search string for poems
    let orQuery = `content.ilike.%${query}%,tags.ilike.%${query}%,genre.ilike.%${query}%`;
    
    let dbQuery = supabase
        .from('poems')
        .select(`
            *,
            poet:poets (id, name, category, avatar, lifetime, bio),
            user:users (name, email),
            likes (id, user_id),
            views (id)
        `);
        
    // If poet names matched, use an 'or' combined with the poet_id, else just use the text search
    if (poetIds.length > 0) {
        const inValues = `(${poetIds.join(',')})`;
        dbQuery = dbQuery.or(`poet_id.in.${inValues},${orQuery}`);
    } else {
        dbQuery = dbQuery.or(orQuery);
    }

    const { data: poems, error } = await dbQuery.order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(poems);
});

// Category
router.get('/category', async (req, res) => {
    const query = req.query.query;
    const { data: poems, error } = await supabase
        .from('poems')
        .select(`
            *,
            poet:poets (id, name, category, avatar, lifetime, bio),
            user:users (name, email),
            likes (id, user_id)
        `)
        .ilike('genre', `%${query}%`)
        .order('id', { ascending: false });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(poems);
});

// Get a poem by ID
router.get('/:id', async (req, res) => {
    const { data: poem, error } = await supabase
        .from('poems')
        .select(`
            *,
            poet:poets (id, name, category, avatar, lifetime, bio),
            user:users (id, name, email),
            comments (
                id,
                text,
                user:users(id, name)
            ),
            likes (id, user_id),
            views (id)
        `)
        .eq('id', req.params.id)
        .single();
        
    if (error) return res.status(500).json({ error: error.message });
    if (!poem) return res.status(404).json({ error: 'Poem not found' });
    
    // Registered views asynchronously.
    supabase.from('views').insert({
        user_id: null,
        poem_id: poem.id,
        poet_id: poem.poet_id
    }).then();
    
    // Logic for similar poems: same author OR overlapping tags
    const tags = poem.tags ? poem.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    let similars = [];
    
    // Build the query
    let simQuery = supabase
        .from('poems')
        .select(`
            *,
            poet:poets (id, name, avatar),
            likes (id, user_id)
        `)
        .neq('id', poem.id)
        .limit(50);

    const conditions = [`poet_id.eq.${poem.poet_id}`];
    tags.forEach(tag => {
        conditions.push(`tags.ilike.%${tag}%`);
    });

    const { data: sim } = await simQuery.or(conditions.join(','));
    
    if (sim) {
        // Sort by relevance (number of matching tags?) or just keep as is (most recent usually)
        similars = sim;
    }
    
    res.json({ poem, similars });
});

// Create poem
router.post('/', async (req, res) => {
    const { content, poet_id, tags, genre, user_id } = req.body;
    
    const { data: poem, error } = await supabase
        .from('poems')
        .insert({
            content,
            poet_id,
            tags,
            genre,
            user_id: user_id || 1
        })
        .select()
        .single();
        
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(poem);
});

// add/remove a like (toggle)
router.post('/:id/like', async (req, res) => {
    const { user_id = 1 } = req.body; 
    const poem_id = req.params.id;

    // Check if any likes exist for this user/poem pair (handle potential duplicates)
    const { data: existingLikes, error: findError } = await supabase
        .from('likes')
        .select('id')
        .eq('poem_id', poem_id)
        .eq('user_id', user_id);

    if (findError) return res.status(500).json({ error: findError.message });

    if (existingLikes && existingLikes.length > 0) {
        // Remove ALL existing likes for this user/poem to clean up and "unlike"
        const { error: delError } = await supabase
            .from('likes')
            .delete()
            .in('id', existingLikes.map(l => l.id));
        
        if (delError) return res.status(500).json({ error: delError.message });
        
        // Get new total count
        const { count } = await supabase
            .from('likes')
            .select('id', { count: 'exact', head: true })
            .eq('poem_id', poem_id);

        return res.json({ status: 'success', action: 'unliked', newCount: count || 0 });
    } else {
        // Add exactly one like
        const { error: insError } = await supabase
            .from('likes')
            .insert({ poem_id, user_id });
            
        if (insError) return res.status(500).json({ error: insError.message });

        // Get new total count
        const { count } = await supabase
            .from('likes')
            .select('id', { count: 'exact', head: true })
            .eq('poem_id', poem_id);

        return res.json({ status: 'success', action: 'liked', newCount: count || 0 });
    }
});

// add a comment
router.post('/:id/comment', async (req, res) => {
    const { user_id, text } = req.body;
    const { error } = await supabase
        .from('comments')
        .insert({ poem_id: req.params.id, user_id, text });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: 'success' });
});

// Update a poem
router.patch('/:id', async (req, res) => {
    const { content, genre, tags, poet_id } = req.body;
    const { data: poem, error } = await supabase
        .from('poems')
        .update({ content, genre, tags, poet_id, updated_at: new Date() })
        .eq('id', req.params.id)
        .select()
        .single();
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(poem);
});

// Delete a poem
router.delete('/:id', async (req, res) => {
    const { error } = await supabase
        .from('poems')
        .delete()
        .eq('id', req.params.id);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: 'success', message: 'Шеър бомуваффақият нест карда шуд.' });
});

module.exports = router;
