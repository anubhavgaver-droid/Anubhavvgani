const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

// Database Name
const DB_NAME = process.env.DB_NAME || "Cluovvoo";

// Cloudflare Turnstile Keys
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEW2Ci6bkvsSt9JE";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "0x4AAAAAAEW2CrKKwntMxBfDSRfXUr48arA";

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
            <!-- Cloudflare Turnstile Script -->
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background: #0b0f19;
                    color: white;
                    font-family: 'Segoe UI', -apple-system, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    overflow: hidden;
                    position: relative;
                }
                
                #fogCanvas {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    z-index: 1;
                    pointer-events: none;
                }

                .card {
                    position: relative;
                    z-index: 2;
                    background: rgba(19, 27, 46, 0.85);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 28px 20px;
                    text-align: center;
                    width: 90%;
                    max-width: 380px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
                }

                h2 { font-size: 20px; letter-spacing: 1px; margin-bottom: 8px; }
                p.sub { color: #94a3b8; font-size: 13px; margin-bottom: 18px; text-transform: uppercase; }

                .turnstile-container {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 18px;
                }

                .btn {
                    background: #00d2ff;
                    color: #000;
                    border: none;
                    padding: 14px 28px;
                    font-size: 15px;
                    font-weight: bold;
                    border-radius: 8px;
                    cursor: pointer;
                    width: 100%;
                    transition: 0.3s ease;
                }
                .btn:hover { background: #00b8e6; }
                .btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; }

                .hidden { display: none; }
                
                .spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid #1e293b;
                    border-top: 4px solid #00d2ff;
                    border-radius: 50%;
                    margin: 0 auto 20px;
                    animation: spin 1s linear infinite;
                }
                .checkmark {
                    display: none;
                    font-size: 48px;
                    color: #10b981;
                    margin-bottom: 15px;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

                .status { margin-top: 12px; color: #38bdf8; font-size: 13px; min-height: 18px; }
                .timer-text { font-size: 12px; color: #64748b; margin-top: 15px; }
            </style>
        </head>
        <body>
            <canvas id="fogCanvas"></canvas>

            <div class="card">
                <!-- STEP 1: CAPTCHA & INITIAL UI -->
                <div id="step1">
                    <h2>SECURE VERIFICATION</h2>
                    <p class="sub">PLEASE COMPLETE THIS INITIAL CHECK TO PROCEED. 🎴</p>
                    
                    <!-- Cloudflare Turnstile Widget -->
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-theme="dark" data-callback="onCaptchaSuccess"></div>
                    </div>

                    <button id="vBtn" class="btn" onclick="processVerify()" disabled>VERIFY NOW</button>
                    <div id="status" class="status">Please complete captcha above</div>
                </div>

                <!-- STEP 2: 5s COUNTDOWN REDIRECT UI -->
                <div id="step2" class="hidden">
                    <div id="loadingSpinner" class="spinner"></div>
                    <div id="checkIcon" class="checkmark">✓</div>
                    <h2>REDIRECTING...</h2>
                    <p id="statusMsg" class="sub">WE ARE TAKING YOU TO THE VERIFICATION PAGE. PLEASE WAIT...</p>
                    <button id="redirectBtn" class="btn hidden" onclick="goShortlink()">CLICK IF NOT REDIRECTED</button>
                    <p class="timer-text">DO NOT CLOSE THIS WINDOW.</p>
                </div>
            </div>

            <script>
                // 1. Fog Particles Animation Engine
                const canvas = document.getElementById('fogCanvas');
                const ctx = canvas.getContext('2d');
                function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
                resizeCanvas();
                window.addEventListener('resize', resizeCanvas);

                const particles = Array.from({ length: 60 }, () => ({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: Math.random() * 2.5 + 0.5,
                    speedY: Math.random() * 0.8 + 0.2,
                    speedX: Math.random() * 0.4 - 0.2,
                    opacity: Math.random() * 0.6 + 0.2
                }));

                function animateParticles() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    particles.forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                        ctx.fillStyle = \`rgba(255, 255, 255, \${p.opacity})\`;
                        ctx.fill();
                        p.y += p.speedY; p.x += p.speedX;
                        if (p.y > canvas.height) p.y = 0;
                        if (p.x > canvas.width) p.x = 0;
                        if (p.x < 0) p.x = canvas.width;
                    });
                    requestAnimationFrame(animateParticles);
                }
                animateParticles();

                // 2. Turnstile Callback
                let turnstileResponseToken = "";
                function onCaptchaSuccess(token) {
                    turnstileResponseToken = token;
                    document.getElementById('vBtn').disabled = false;
                    document.getElementById('status').innerText = "";
                }

                // 3. Token & Verification Processing
                let destinationUrl = "";

                async function processVerify() {
                    if (!turnstileResponseToken) {
                        alert("Please complete the Captcha check!");
                        return;
                    }

                    const btn = document.getElementById('vBtn');
                    const status = document.getElementById('status');
                    btn.disabled = true;
                    btn.innerText = "INITIALIZING...";
                    status.innerText = "Validating security check...";

                    try {
                        const res = await fetch(\`/api/process-token?token=${cleanToken}&cf_token=\${encodeURIComponent(turnstileResponseToken)}\`);
                        const data = await res.json();
                        
                        if(data.success && data.url) {
                            destinationUrl = data.url;
                            startCountdown();
                        } else {
                            alert(data.message || "Verification Failed!");
                            if (window.turnstile) window.turnstile.reset();
                            btn.disabled = true;
                            btn.innerText = "VERIFY NOW";
                            status.innerText = "Verification failed. Please retry captcha.";
                        }
                    } catch(e) {
                        alert("Network Error! Please try again.");
                        if (window.turnstile) window.turnstile.reset();
                        btn.disabled = true;
                        btn.innerText = "VERIFY NOW";
                        status.innerText = "Network error. Please try again.";
                    }
                }

                function startCountdown() {
                    document.getElementById('step1').classList.add('hidden');
                    document.getElementById('step2').classList.remove('hidden');

                    let seconds = 5;
                    const statusMsg = document.getElementById('statusMsg');

                    const timer = setInterval(() => {
                        statusMsg.innerText = \`Verification link ready! Redirecting in \${seconds}s...\`;
                        seconds--;

                        if (seconds < 0) {
                            clearInterval(timer);
                            document.getElementById('loadingSpinner').style.display = 'none';
                            document.getElementById('checkIcon').style.display = 'block';
                            document.getElementById('redirectBtn').classList.remove('hidden');
                            statusMsg.innerText = "Verification link ready!";
                            goShortlink();
                        }
                    }, 1000);
                }

                function goShortlink() {
                    if (destinationUrl) {
                        window.location.href = destinationUrl;
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

// Single-Use Anti-Bypass API Endpoint with Turnstile Server Validation
app.get('/api/process-token', async (req, res) => {
    const { token, cf_token } = req.query;

    if (!token) return res.json({ success: false, message: "Token missing" });
    if (!cf_token) return res.json({ success: false, message: "Captcha token missing" });

    try {
        // 1. Verify Turnstile Token with Cloudflare Server
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const cfResponse = await axios.post(verifyUrl, new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: cf_token
        }));

        if (!cfResponse.data.success) {
            return res.json({ success: false, message: "Security Captcha verification failed!" });
        }

        const cleanToken = token.trim();

        // 2. Atomically find & delete token from MongoDB
        const result = await db.collection('verify_tokens').findOneAndDelete({ 
            token: cleanToken, 
            is_used: false 
        });

        const tokenDoc = result.value || result;

        if (!tokenDoc || !tokenDoc.token) {
            return res.json({ success: false, message: "Token already used or expired!" });
        }

        // Fetch settings from DB
        const settings = await db.collection('settings').findOne({ _id: "bot_settings" });

        if (!settings || !settings.shortlink_url || !settings.shortlink_api) {
            return res.json({ success: false, message: "Shortener configuration missing in Database." });
        }

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
        return res.json({ success: false, message: "Server Verification Error." });
    }
});

app.listen(PORT, () => console.log(`Proxy server listening on port ${PORT}`));
