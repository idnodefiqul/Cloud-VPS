const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Storage configuration for multer (10GB limit)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileId = crypto.randomUUID();
        const extension = path.extname(file.originalname);
        const filename = fileId + extension;
        
        // Store original filename mapping
        req.fileMapping = {
            id: fileId,
            originalName: file.originalname,
            filename: filename,
            uploadDate: new Date()
        };
        
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024 // 10GB in bytes
    }
});

// In-memory storage for file mappings (in production, use database)
let fileDatabase = {};

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Routes
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Simple authentication (in production, use proper authentication)
    if (username === 'admin' && password === 'admin123') {
        req.session.authenticated = true;
        req.session.username = username;
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: 'Username atau password salah!' });
    }
});

app.get('/dashboard', requireAuth, (req, res) => {
    const userFiles = Object.values(fileDatabase).filter(file => file.uploadedBy === req.session.username);
    res.render('dashboard', { 
        username: req.session.username,
        files: userFiles
    });
});

app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
        id: req.fileMapping.id,
        originalName: req.fileMapping.originalName,
        filename: req.fileMapping.filename,
        size: req.file.size,
        uploadDate: req.fileMapping.uploadDate,
        uploadedBy: req.session.username,
        shareLink: `/antono/${req.fileMapping.id}`
    };

    fileDatabase[req.fileMapping.id] = fileInfo;

    res.json({
        success: true,
        file: fileInfo
    });
});

app.get('/antono/:id', (req, res) => {
    const fileInfo = fileDatabase[req.params.id];
    
    if (!fileInfo) {
        return res.status(404).render('error', { message: 'File tidak ditemukan' });
    }

    res.render('preview', { file: fileInfo });
});

app.get('/markjubaidah/:id', (req, res) => {
    const fileInfo = fileDatabase[req.params.id];
    
    if (!fileInfo) {
        return res.status(404).json({ error: 'File tidak ditemukan' });
    }

    const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File tidak ditemukan di server' });
    }

    res.download(filePath, fileInfo.originalName);
});

app.delete('/file/:id', requireAuth, (req, res) => {
    const fileInfo = fileDatabase[req.params.id];
    
    if (!fileInfo || fileInfo.uploadedBy !== req.session.username) {
        return res.status(404).json({ error: 'File tidak ditemukan' });
    }

    const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    delete fileDatabase[req.params.id];
    res.json({ success: true });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
    console.log('Username: admin');
    console.log('Password: admin123');
});
