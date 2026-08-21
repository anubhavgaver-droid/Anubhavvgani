const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

const DB_NAME = process.env.DB_NAME || "Cluovvoo";

const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEW2Ci6bkvsSt9JE";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "0x4AAAAAAEW2CrKKwntMxBfDSRfXUr48arA";

let db;

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

// ----------------------------------------------------------------------
// 🛠️ KEEP-ALIVE / HEALTH CHECK ROUTES (For Cron-Job.org & Sleep Prevention)
// ----------------------------------------------------------------------
app.get('/ping', (req, res) => res.status(200).send('SERVER_AWAKE'));
app.get('/', (req, res) => res.status(200).send('Zender Proxy Server is Active'));

app.use(async (req, res, next) => {
    await connectDB();
    if (!db) {
        return res.status(500).send("Database Connection Error. Please refresh.");
    }
    next();
});

// Helper Function: Cyan HUD Access Denied Template
function renderAccessDeniedUI(reasonText) {
    return `
    <!DOCTYPE html>
    <html lang="hi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Denied - Security Gateway</title>
        <style>
            :root {
                --bg-color: #07090e;
                --card-bg: rgba(13, 17, 23, 0.85);
                --cyan-glow: #00f3ff;
                --red-glow: #ff0055;
                --red-dim: rgba(255, 0, 85, 0.15);
                --text-main: #e6edf3;
                --text-sub: #8b949e;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', -apple-system, sans-serif; }
            body {
                background-color: var(--bg-color);
                color: var(--text-main);
                display: flex; justify-content: center; align-items: center;
                min-height: 100vh; padding: 20px; overflow: hidden;
                background-image: 
                    radial-gradient(circle at 50% 20%, rgba(0, 243, 255, 0.08) 0%, transparent 60%),
                    radial-gradient(circle at 80% 80%, rgba(255, 0, 85, 0.05) 0%, transparent 50%);
            }
            .cyan-glow-orb {
                position: absolute; width: 300px; height: 300px;
                background: var(--cyan-glow); filter: blur(140px);
                opacity: 0.18; pointer-events: none; z-index: 0;
            }
            .hud-card {
                position: relative; z-index: 1; width: 100%; max-width: 400px;
                background: var(--card-bg); backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(0, 243, 255, 0.25); border-radius: 16px;
                padding: 28px 24px; text-align: center;
                box-shadow: 0 0 30px rgba(0, 243, 255, 0.1);
            }
            .badge-denied {
                display: inline-block; padding: 6px 14px; border-radius: 20px;
                font-size: 11px; font-weight: 700; letter-spacing: 1.5px;
                background: var(--red-dim); border: 1px solid var(--red-glow);
                color: var(--red-glow); box-shadow: 0 0 12px rgba(255, 0, 85, 0.3);
                margin-bottom: 20px;
            }
            .status-icon { font-size: 42px; margin-bottom: 12px; filter: drop-shadow(0 0 10px var(--red-glow)); }
            .title { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 8px; }
            .subtitle { font-size: 13px; color: var(--text-sub); margin-bottom: 22px; line-height: 1.5; }
            .reason-box {
                background: rgba(0, 0, 0, 0.4); border-left: 3px solid var(--cyan-glow);
                border-radius: 6px; padding: 14px; text-align: left; margin-bottom: 24px;
            }
            .reason-title { font-size: 10px; text-transform: uppercase; color: var(--cyan-glow); letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; }
            .reason-text { font-size: 13px; color: var(--text-main); font-weight: 500; }
            .btn-action {
                display: block; width: 100%; padding: 12px; border-radius: 8px;
                background: linear-gradient(135deg, rgba(0, 243, 255, 0.2) 0%, rgba(0, 243, 255, 0.05) 100%);
                border: 1px solid var(--cyan-glow); color: var(--cyan-glow);
                font-weight: 600; font-size: 14px; text-decoration: none;
                transition: 0.3s ease; box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
            }
            .btn-action:hover { background: var(--cyan-glow); color: #000; box-shadow: 0 0 25px rgba(0, 243, 255, 0.6); }
        </style>
    </head>
    <body>
        <div class="cyan-glow-orb"></div>
        <div class="hud-card">
            <div class="badge-denied">[ ACCESS DENIED ]</div>
            <div class="status-icon">⚠️</div>
            <h1 class="title">सत्यापन विफल (Verification Failed)</h1>
            <p class="subtitle">सुरक्षा प्रोटोकॉल के कारण अनुरोध को निरस्त कर दिया गया है।</p>
            <div class="reason-box">
                <div class="reason-title">SYSTEM DIAGNOSTIC:</div>
                <div class="reason-text">${reasonText}</div>
            </div>
            <a href="https://t.me/SmartfilestorebyAcbot" class="btn-action">
                🔄 नया लिंक प्राप्त करें (Get New Link)
            </a>
        </div>
    </body>
    </html>
    `;
}

app.get('/verify', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send(renderAccessDeniedUI("🚫 अमान्य टोकन पैरामीटर (Missing or Invalid Token)"));
    }

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ 
            token: cleanToken, 
            is_used: false 
        });

        if (!tokenDoc) {
            return res.status(403).send(renderAccessDeniedUI("⚡ यह लिंक पहले ही इस्तेमाल हो चुका है या एक्सपायर हो गया है।"));
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Secure Verification</title>
            
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background: #0b0f19; color: white;
                    font-family: 'Segoe UI', -apple-system, sans-serif;
                    display: flex; justify-content: center; align-items: center;
                    min-height: 100vh; overflow: hidden; position: relative;
                }
                #fogCanvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
                .card {
                    position: relative; z-index: 2;
                    background: rgba(19, 27, 46, 0.85); backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(0, 243, 255, 0.3); border-radius: 16px;
                    padding: 28px 20px; text-align: center; width: 90%; max-width: 380px;
                    box-shadow: 0 0 25px rgba(0, 243, 255, 0.15);
                }
                h2 { font-size: 20px; letter-spacing: 1px; margin-bottom: 8px; color: #fff; }
                p.sub { color: #8b949e; font-size: 12px; margin-bottom: 18px; text-transform: uppercase; letter-spacing: 0.5px; }
                .turnstile-container { display: flex; justify-content: center; margin-bottom: 18px; }
                .btn {
                    background: linear-gradient(135deg, #00f3ff 0%, #00a6ff 100%);
                    color: #000; border: none; padding: 14px 28px; font-size: 15px; font-weight: bold;
                    border-radius: 8px; cursor: pointer; width: 100%; transition: 0.3s ease;
                    box-shadow: 0 0 15px rgba(0, 243, 255, 0.3);
                }
                .btn:hover { box-shadow: 0 0 25px rgba(0, 243, 255, 0.6); transform: translateY(-1px); }
                .btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; box-shadow: none; }
                .hidden { display: none; }
                .spinner {
                    width: 48px; height: 48px; border: 4px solid #1e293b;
                    border-top: 4px solid #00f3ff; border-radius: 50%;
                    margin: 0 auto 20px; animation: spin 1s linear infinite;
                }
                .checkmark { display: none; font-size: 48px; color: #10b981; margin-bottom: 15px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .status { margin-top: 12px; color: #00f3ff; font-size: 13px; min-height: 18px; }
                .timer-text { font-size: 12px; color: #64748b; margin-top: 15px; }
            </style>
        </head>
        <body>
            <canvas id="fogCanvas"></canvas>

            <div class="card">
                <div id="step1">
                    <h2>SECURE VERIFICATION</h2>
                    <p class="sub">PLEASE COMPLETE THIS INITIAL CHECK TO PROCEED 🎴</p>
                    
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-theme="dark" data-callback="onCaptchaSuccess"></div>
                    </div>

                    <button id="vBtn" class="btn" onclick="processVerify()" disabled>VERIFY NOW</button>
                    <div id="status" class="status">Please complete captcha above</div>
                </div>

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
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

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
                        ctx.fillStyle = \`rgba(0, 243, 255, \${p.opacity})\`;
                        ctx.fill();
                        p.y += p.speedY; p.x += p.speedX;
                        if (p.y > canvas.height) p.y = 0;
                        if (p.x > canvas.width) p.x = 0;
                        if (p.x < 0) p.x = canvas.width;
                    });
                    requestAnimationFrame(animateParticles);
                }
                animateParticles();

                let turnstileResponseToken = "";
                function onCaptchaSuccess(token) {
                    turnstileResponseToken = token;
                    document.getElementById('vBtn').disabled = false;
                    document.getElementById('status').innerText = "";
                }

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
                        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                            window.Telegram.WebApp.openLink(destinationUrl);
                            window.Telegram.WebApp.close();
                        } else {
                            window.location.href = destinationUrl;
                        }
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

app.get('/api/process-token', async (req, res) => {
    const { token, cf_token } = req.query;

    if (!token) return res.json({ success: false, message: "Token missing" });
    if (!cf_token) return res.json({ success: false, message: "Captcha token missing" });

    try {
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const cfResponse = await axios.post(verifyUrl, new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: cf_token
        }));

        if (!cfResponse.data.success) {
            return res.json({ success: false, message: "Security Captcha verification failed!" });
        }

        const cleanToken = token.trim();

        const result = await db.collection('verify_tokens').findOneAndDelete({ 
            token: cleanToken, 
            is_used: false 
        });

        const tokenDoc = result.value || result;

        if (!tokenDoc || !tokenDoc.token) {
            return res.json({ success: false, message: "Token already used or expired!" });
        }

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
