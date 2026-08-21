const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

// Database Name
const DB_NAME = process.env.DB_NAME || "Cluovvoo";

let db;

// MongoDB Connection Helper
async function connectDB() {
    if (!db) {
        try {
            const client = new MongoClient(MONGO_URI);
            await client.connect();
            db = client.db(DB_NAME);
            console.log(`✅ Connected successfully to DB: ${db.databaseName}`);
        } catch (err) {
            console.error("❌ MongoDB Connection Error:", err);
        }
    }
    return db;
}

// Connection Middleware
app.use(async (req, res, next) => {
    await connectDB();
    if (!db) {
        return res.status(500).send("Database Connection Error. Please refresh.");
    }
    next();
});

// Verification UI Page
app.get('/verify', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send("Invalid Token Parameter");
    }

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ 
            token: cleanToken, 
            is_used: false 
        });

        if (!tokenDoc) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                <body style="background:#0b0f19;color:#ef4444;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;">
                    <div style="text-align:center; padding:20px;">
                        <h2>❌ Link Expired or Already Used!</h2>
                        <p style="color:#94a3b8;">Please return to Telegram and generate a new link.</p>
                    </div>
                </body>
                </html>
            `);
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Secure Verification</title>
            <style>
                body { background: #0b0f19; color: white; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 30px; text-align: center; width: 85%; max-width: 380px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                .btn { background: #00d2ff; color: #000; border: none; padding: 14px 28px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; width: 100%; margin-top: 20px; transition: 0.2s; }
                .btn:disabled { background: #334155; color: #94a3b8; }
                .status { margin-top: 15px; color: #38bdf8; font-size: 13px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2 style="letter-spacing:1px; margin-bottom:5px;">SECURE VERIFICATION</h2>
                <p style="color:#94a3b8; font-size:13px;">PLEASE COMPLETE THIS INITIAL CHECK TO PROCEED.</p>
                <button id="vBtn" class="btn" onclick="processVerify()">VERIFY NOW</button>
                <div id="status" class="status"></div>
            </div>

            <script>
                async function processVerify() {
                    const btn = document.getElementById('vBtn');
                    const status = document.getElementById('status');
                    btn.disabled = true;
                    btn.innerText = "INITIALIZING...";
                    status.innerText = "Generating link, please wait...";

                    try {
                        const res = await fetch('/api/process-token?token=${cleanToken}');
                        const data = await res.json();
                        
                        if(data.success && data.url) {
                            status.innerText = "Redirecting to Shortener...";
                            window.location.href = data.url;
                        } else {
                            alert(data.message || "Verification Failed!");
                            btn.disabled = false;
                            btn.innerText = "VERIFY NOW";
                            status.innerText = "";
                        }
                    } catch(e) {
                        alert("Network Error! Please try again.");
                        btn.disabled = false;
                        btn.innerText = "VERIFY NOW";
                    }
                }
            </script>
        </body>
        </html>
        `);
    } catch (e) {
        console.error("Verification Route Error:", e);
        res.status(500).send("Internal Server Error");
    }
});

// Single-Use Anti-Bypass API Endpoint
app.get('/api/process-token', async (req, res) => {
    const { token } = req.query;

    if (!token) return res.json({ success: false, message: "Token missing" });

    try {
        const cleanToken = token.trim();

        // Atomically find & delete token
        const result = await db.collection('verify_tokens').findOneAndDelete({ 
            token: cleanToken, 
            is_used: false 
        });

        const tokenDoc = result.value || result;

        if (!tokenDoc || !tokenDoc.token) {
            return res.json({ success: false, message: "Token already used or expired!" });
        }

        // Fetch settings from 'settings' collection and '_id: bot_settings'
        const settings = await db.collection('settings').findOne({ _id: "bot_settings" });

        if (!settings || !settings.shortlink_url || !settings.shortlink_api) {
            return res.json({ success: false, message: "Shortener configuration missing in Database." });
        }

        // Handles bot username automatically (strips '@' if present)
        let rawBotUsername = settings.bot_username || "SmartfilestorebyAcbot";
        const botUsername = rawBotUsername.replace(/^@/, '');

        const targetTelegramUrl = `https://t.me/${botUsername}?start=verify_${cleanToken}`;
        
        const shortenerApiUrl = `https://${settings.shortlink_url}/api?api=${settings.shortlink_api}&url=${encodeURIComponent(targetTelegramUrl)}`;
        const response = await axios.get(shortenerApiUrl);
        
        const shortUrl = response.data.shortenedUrl || response.data.url;

        if (shortUrl) {
            return res.json({ success: true, url: shortUrl });
        } else {
            return res.json({ success: false, message: "Failed to generate shortener link." });
        }
    } catch (err) {
        console.error("API Error:", err);
        return res.json({ success: false, message: "Shortener API Connection Error." });
    }
});

app.listen(PORT, () => console.log(`Proxy server listening on port ${PORT}`));
