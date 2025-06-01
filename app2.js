const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;

// Database setup
const db = new sqlite3.Database('apeh.db', (err) => {
    if (err) {
        console.error('Error connecting to SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        // Create users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);
        // Create files table
        db.run(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                originalName TEXT NOT NULL,
                filename TEXT NOT NULL,
                size INTEGER NOT NULL,
                uploadDate TEXT NOT NULL,
                uploadedBy TEXT NOT NULL,
                shareLink TEXT NOT NULL
            )
        `);
        // Insert default admin user if not exists
        bcrypt.hash('Taufiqul0012@kq', 10, (err, hash) => {
            if (err) {
                console.error('Error hashing default admin password:', err);
                return;
            }
            db.run(
                `INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`,
                ['idnodefiqul', hash],
                (err) => {
                    if (err) {
                        console.error('Error inserting default admin user:', err);
                    }
                }
            );
        });
    }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session configuration
app.use(session({
    secret: 'your-secret-key', // In production, use environment variable
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
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

        // Store file metadata temporarily in req
        req.fileMapping = {
            id: fileId,
            originalName: file.originalname,
            filename: filename,
            uploadDate: new Date().toISOString()
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

    db.get(
        `SELECT * FROM users WHERE username = ?`,
        [username],
        (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).render('error', { message: 'Internal server error' });
            }
            if (!user) {
                return res.render('login', { error: 'Username atau password salah!' });
            }

            bcrypt.compare(password, user.password, (err, result) => {
                if (err) {
                    console.error('Error comparing passwords:', err);
                    return res.status(500).render('error', { message: 'Internal server error' });
                }
                if (result) {
                    req.session.authenticated = true;
                    req.session.username = username;
                    res.redirect('/dashboard');
                } else {
                    res.render('login', { error: 'Username atau password salah!' });
                }
            });
        }
    );
});

app.get('/dashboard', requireAuth, (req, res) => {
    db.all(
        `SELECT * FROM files WHERE uploadedBy = ?`,
        [req.session.username],
        (err, files) => {
            if (err) {
                console.error('Error fetching files:', err);
                return res.status(500).render('error', { message: 'Internal server error' });
            }
            res.render('dashboard', {
                username: req.session.username,
                files: files
            });
        }
    );
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

    db.run(
        `INSERT INTO files (id, originalName, filename, size, uploadDate, uploadedBy, shareLink)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            fileInfo.id,
            fileInfo.originalName,
            fileInfo.filename,
            fileInfo.size,
            fileInfo.uploadDate,
            fileInfo.uploadedBy,
            fileInfo.shareLink
        ],
        (err) => {
            if (err) {
                console.error('Error saving file metadata:', err);
                return res.status(500).json({ error: 'Error saving file metadata' });
            }
            res.json({
                success: true,
                file: fileInfo
            });
        }
    );
});

app.get('/antono/:id', (req, res) => {
    db.get(
        `SELECT * FROM files WHERE id = ?`,
        [req.params.id],
        (err, fileInfo) => {
            if (err) {
                console.error('Error fetching file:', err);
                return res.status(500).render('error', { message: 'Internal server error' });
            }
            if (!fileInfo) {
                return res.status(404).render('error', { message: 'File tidak ditemukan' });
            }
            res.render('preview', { file: fileInfo });
        }
    );
});

app.get('/markjubaidah/:id', (req, res) => {
    db.get(
        `SELECT * FROM files WHERE id = ?`,
        [req.params.id],
        (err, fileInfo) => {
            if (err) {
                console.error('Error fetching file:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            if (!fileInfo) {
                return res.status(404).json({ error: 'File tidak ditemukan' });
            }

            const filePath = path.join(__dirname, 'uploads', fileInfo.filename);

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File tidak ditemukan di server' });
            }

            res.download(filePath, fileInfo.originalName);
        }
    );
});

app.delete('/file/:id', requireAuth, (req, res) => {
    db.get(
        `SELECT * FROM files WHERE id = ? AND uploadedBy = ?`,
        [req.params.id, req.session.username],
        (err, fileInfo) => {
            if (err) {
                console.error('Error fetching file:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            if (!fileInfo) {
                return res.status(404).json({ error: 'File tidak ditemukan' });
            }

            const filePath = path.join(__dirname, 'uploads', fileInfo.filename);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            db.run(
                `DELETE FROM files WHERE id = ?`,
                [req.params.id],
                (err) => {
                    if (err) {
                        console.error('Error deleting file metadata:', err);
                        return res.status(500).json({ error: 'Error deleting file' });
                    }
                    res.json({ success: true });
                }
            );
        }
    );
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
    console.log('Default credentials:');
    console.log('Username: admin');
    console.log('Password: admin123');
});
