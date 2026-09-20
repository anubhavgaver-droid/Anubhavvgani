const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

const DB_NAME = process.env.DB_NAME || "Cluovvoo";

const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEW2Ci6bkvsSt9JE";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "0x4AAAAAAEW2CrKKwntMxBfDSRfXUr48arA";

// 🔐 Postback Secret Key
const POSTBACK_SECRET = process.env.POSTBACK_SECRET || "Zender_Secret_Pass_8921";

// ⚙️ POSTBACK REQUIREMENT FLAG:
const REQUIRE_POSTBACK = false; 

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

// Cryptographic HMAC Hash Generator
function generateSecureHash(token, timestamp) {
    return crypto.createHmac('sha256', POSTBACK_SECRET)
                 .update(`${token}_${timestamp}`)
                 .digest('hex');
}

app.get('/ping', (req, res) => res.status(200).send('SERVER_AWAKE'));
app.get('/', (req, res) => res.status(200).send('Zender Proxy Server is Active'));

app.use(async (req, res, next) => {
    await connectDB();
    if (!db) {
        return res.status(500).send("Database Connection Error. Please refresh.");
    }
    next();
});

function renderAccessDeniedUI(reasonText) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Denied - Security Gateway</title>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>
            :root {
                --bg-color: #0b0f19;
                --card-bg: rgba(20, 26, 40, 0.75);
                --red-glow: #ff4757;
                --red-dim: rgba(255, 71, 87, 0.15);
                --text-main: #ffffff;
                --text-sub: #94a3b8;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body {
                background-color: var(--bg-color);
                background-image: radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 100%);
                color: var(--text-main);
                display: flex; flex-direction: column; justify-content: center; align-items: center;
                min-height: 100vh; padding: 20px; overflow: hidden;
            }
            .hud-card {
                position: relative; z-index: 2; width: 330px;
                background: var(--card-bg); border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(12px); border-radius: 28px; padding: 35px 20px 25px 20px; text-align: center;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
            }
            .badge-denied {
                display: inline-block; padding: 6px 14px; border-radius: 20px;
                font-size: 11px; font-weight: 700; letter-spacing: 1.5px;
                background: var(--red-dim); border: 1px solid var(--red-glow);
                color: var(--red-glow); margin-bottom: 20px;
            }
            .status-icon { font-size: 42px; margin-bottom: 12px; }
            .title { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 8px; }
            .subtitle { font-size: 13px; color: var(--text-sub); margin-bottom: 22px; line-height: 1.5; }
            .reason-box {
                background: rgba(0, 0, 0, 0.4); border-left: 3px solid var(--red-glow);
                border-radius: 6px; padding: 14px; text-align: left; margin-bottom: 24px;
            }
            .reason-title { font-size: 10px; text-transform: uppercase; color: var(--red-glow); letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; }
            .reason-text { font-size: 13px; color: var(--text-main); font-weight: 500; }
            .btn-action {
                display: block; width: 100%; padding: 12px; border-radius: 20px;
                background: linear-gradient(135deg, #334155, #1e293b); border: 1px solid rgba(255,255,255,0.1); color: #fff;
                font-weight: 600; font-size: 14px; text-decoration: none; transition: 0.3s ease;
            }
            .footer { margin-top: 25px; font-size: 11px; color: #64748b; text-align: center; z-index: 2; line-height: 1.6; }
            .footer-link { color: #38bdf8; text-decoration: none; font-weight: bold; transition: color 0.2s; }
            .footer-link:hover { color: #7dd3fc; text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="hud-card">
            <div class="badge-denied">[ ACCESS DENIED ]</div>
            <div class="status-icon">⚠️</div>
            <h1 class="title">Verification Failed</h1>
            <p class="subtitle">Access restricted by security protocols.</p>
            <div class="reason-box">
                <div class="reason-title">SYSTEM DIAGNOSTIC:</div>
                <div class="reason-text">${reasonText}</div>
            </div>
            <a href="https://t.me/SmartfilestorebyAcbot" class="btn-action">🔄 GET NEW LINK</a>
        </div>
        <div class="footer">
            © 2026 All Rights Reserved<br>
            Powered by <a href="https://t.me/pratilipifm0900" target="_blank" class="footer-link">GW KaLu</a>
        </div>
        <script>
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.ready();
                window.Telegram.WebApp.expand();
            }
        </script>
    </body>
    </html>
    `;
}

app.get('/access-denied', (req, res) => {
    const reason = req.query.reason || "Verification process failed.";
    res.send(renderAccessDeniedUI(reason));
});

// Helper Function for Common Winter & Foggy Theme CSS/JS with Animations
function getWinterThemeStyles() {
    return `
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body {
                background: #090d16;
                color: #e2e8f0;
                display: flex; flex-direction: column; justify-content: center; align-items: center;
                min-height: 100vh; overflow: hidden; position: relative;
            }
            
            .winter-bg {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: radial-gradient(circle at 50% 20%, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.8) 70%, #070a12 100%);
                z-index: 0;
            }

            .fog-container {
                position: absolute; width: 200%; height: 100%; top: 0; left: -50%;
                background: url('https://raw.githubusercontent.com/daniel-ice/fog-effect/main/fog.png') repeat-x;
                background-size: cover; opacity: 0.15;
                animation: fogMove 30s linear infinite;
                z-index: 1; pointer-events: none;
            }
            @keyframes fogMove {
                0% { transform: translateX(0); }
                100% { transform: translateX(25%); }
            }

            .snowflake {
                position: absolute; top: -10px; color: #ffffff; opacity: 0.6;
                font-size: 1em; animation: fall linear infinite; z-index: 1; pointer-events: none;
            }
            @keyframes fall {
                0% { transform: translateY(-10px) rotate(0deg); opacity: 0.8; }
                100% { transform: translateY(100vh) rotate(360deg); opacity: 0.2; }
            }

            .card {
                position: relative; z-index: 2;
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.12);
                backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                border-radius: 28px; width: 330px; padding: 35px 20px 25px 20px;
                display: flex; flex-direction: column; align-items: center;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), inset 0 0 15px rgba(255, 255, 255, 0.03);
            }

            .timer-container {
                position: relative; width: 120px; height: 120px;
                display: flex; justify-content: center; align-items: center;
                margin-bottom: 20px;
            }
            .progress-ring { transform: rotate(-90deg); }
            .progress-ring__circle {
                stroke-dasharray: 314.159; stroke-dashoffset: 0;
                transition: stroke-dashoffset 0.1s linear; stroke-linecap: round;
                filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.8));
            }
            .number { position: absolute; font-size: 2.2rem; font-weight: 700; color: #38bdf8; text-shadow: 0 0 10px rgba(56, 189, 248, 0.5); }
            
            .brand-title { color: #38bdf8; font-size: 1.1rem; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; text-shadow: 0 0 8px rgba(56, 189, 248, 0.4); }
            .section-title { color: #ffffff; font-size: 1.3rem; font-weight: 600; margin-bottom: 8px; }
            .status-text { color: #94a3b8; font-size: 0.85rem; margin-bottom: 20px; text-align: center; height: 20px; transition: color 0.3s ease; }
            
            .turnstile-container { display: flex; justify-content: center; margin-bottom: 18px; width: 100%; }
            .btn {
                background: linear-gradient(135deg, #38bdf8, #0284c7);
                color: #ffffff; border: none; padding: 13px 20px;
                font-size: 14px; font-weight: 700; border-radius: 20px;
                cursor: pointer; width: 100%; transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(56, 189, 248, 0.3);
                letter-spacing: 0.5px;
            }
            .btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(56, 189, 248, 0.5); }
            .btn:disabled { background: #1e293b; color: #64748b; cursor: not-allowed; box-shadow: none; border: 1px solid rgba(255,255,255,0.05); }

            /* Tick Checkmark Animation CSS */
            .success-checkmark { display: none; width: 80px; height: 80px; margin: 0 auto 10px; }
            .check-icon {
                width: 80px; height: 80px; position: relative; border-radius: 50%;
                box-sizing: content-box; border: 4px solid #38bdf8;
                box-shadow: 0 0 15px rgba(56, 189, 248, 0.6);
            }
            .check-icon::before {
                top: 3px; left: -2px; width: 30px; transform-origin: 100% 50%;
                border-radius: 100px 0 0 100px;
            }
            .check-icon::after {
                top: 0; left: 30px; width: 60px; transform-origin: 0 50%;
                border-radius: 0 100px 100px 0; animation: rotate-circle 4.25s ease-in;
            }
            .check-icon::before, .check-icon::after {
                content: ''; position: absolute; height: 100%; background: transparent; transform: rotate(-45deg);
            }
            .icon-line {
                height: 5px; background-color: #38bdf8; display: block; border-radius: 2px;
                position: absolute; z-index: 10;
            }
            .line-tip { top: 46px; left: 14px; width: 25px; transform: rotate(45deg); animation: icon-line-tip 0.75s; }
            .line-long { top: 38px; right: 8px; width: 47px; transform: rotate(-45deg); animation: icon-line-long 0.75s; }
            
            @keyframes icon-line-tip {
                0% { width: 0; left: 1px; top: 19px; }
                54% { width: 0; left: 1px; top: 19px; }
                70% { width: 50px; left: -8px; top: 37px; }
                84% { width: 17px; left: 21px; top: 48px; }
                100% { width: 25px; left: 14px; top: 46px; }
            }
            @keyframes icon-line-long {
                0% { width: 0; right: 46px; top: 54px; }
                65% { width: 0; right: 46px; top: 54px; }
                84% { width: 55px; right: 0px; top: 35px; }
                100% { width: 47px; right: 8px; top: 38px; }
            }

            .footer {
                position: relative; z-index: 2; margin-top: 25px;
                font-size: 11px; color: #64748b; text-align: center; line-height: 1.6;
            }
            .footer-link {
                color: #38bdf8; text-decoration: none; font-weight: bold; transition: color 0.2s;
            }
            .footer-link:hover {
                color: #7dd3fc; text-decoration: underline;
            }
        </style>
    `;
}

// ----------------------------------------------------------------------
// 1️⃣ STEP 1: INITIAL VERIFICATION PAGE (/verify)
// ----------------------------------------------------------------------
app.get('/verify', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send(renderAccessDeniedUI("🚫 Missing or invalid token parameter."));
    }

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ 
            token: cleanToken, 
            is_used: false 
        });

        if (!tokenDoc) {
            return res.status(403).send(renderAccessDeniedUI("⚡ Token has already been used or link expired."));
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Security Verification</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            ${getWinterThemeStyles()}
        </head>
        <body>
            <div class="winter-bg"></div>
            <div class="fog-container"></div>

            <div class="card">
                <div id="timerBox" class="timer-container">
                    <svg class="progress-ring" width="120" height="120">
                        <circle stroke="rgba(56, 189, 248, 0.15)" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                        <circle id="ring" class="progress-ring__circle" stroke="#38bdf8" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                    </svg>
                    <div id="countdown" class="number">5</div>
                </div>

                <div id="successCheck" class="success-checkmark">
                    <div class="check-icon">
                        <span class="icon-line line-tip"></span>
                        <span class="icon-line line-long"></span>
                    </div>
                </div>

                <h1 class="brand-title">Ac Premium</h1>
                <h2 class="section-title">Security Check</h2>
                <p id="statusText" class="status-text">Initializing session...</p>

                <div id="verify-form" style="width: 100%;">
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-theme="dark" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onCaptchaSuccess"></div>
                    </div>
                    <button id="vBtn" class="btn" onclick="processVerify()" disabled>VERIFY & CONTINUE</button>
                </div>
            </div>

            <div class="footer">
                © 2026 All Rights Reserved<br>
                Powered by <a href="https://t.me/pratilipifm0900" target="_blank" class="footer-link">GW KaLu</a>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                function haptic(type) {
                    try {
                        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                            if (type === 'success') window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                            else if (type === 'impact') window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                            else if (type === 'light') window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                        }
                    } catch(e){}
                }

                for(let i=0; i<25; i++) {
                    let flake = document.createElement('div');
                    flake.className = 'snowflake';
                    flake.innerHTML = '❄';
                    flake.style.left = Math.random() * 100 + 'vw';
                    flake.style.animationDuration = (Math.random() * 3 + 3) + 's';
                    flake.style.fontSize = (Math.random() * 10 + 10) + 'px';
                    document.body.appendChild(flake);
                }

                const circle = document.getElementById('ring');
                const countdownEl = document.getElementById('countdown');
                const statusTextEl = document.getElementById('statusText');

                const radius = circle.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = \`\${circumference} \${circumference}\`;

                function setProgress(percent) {
                    const offset = circumference - (percent / 100) * circumference;
                    circle.style.strokeDashoffset = offset;
                }
                setProgress(100);

                const countMsgs = {
                    5: "Initializing secure session...",
                    4: "Encrypting parameters...",
                    3: "Checking Cloudflare Turnstile...",
                    2: "Verifying system integrity...",
                    1: "Almost ready, tap button below!"
                };

                let totalDuration = 5000;
                let timeRemaining = totalDuration;

                let timer = setInterval(() => {
                    timeRemaining -= 100;
                    const displaySeconds = Math.ceil(timeRemaining / 1000);
                    
                    if (timeRemaining >= 0) {
                        countdownEl.textContent = displaySeconds;
                        setProgress((timeRemaining / totalDuration) * 100);
                        if (countMsgs[displaySeconds]) {
                            statusTextEl.textContent = countMsgs[displaySeconds];
                        }
                    } else {
                        clearInterval(timer);
                        countdownEl.textContent = "0";
                        setProgress(0);
                        statusTextEl.textContent = "Complete Security Check";
                    }
                }, 100);

                let turnstileResponseToken = "";
                function onCaptchaSuccess(token) {
                    haptic('light');
                    turnstileResponseToken = token;
                    document.getElementById('vBtn').disabled = false;
                }

                function startSecondaryCountdown() {
                    let duration = 5000;
                    let remaining = duration;
                    countdownEl.textContent = "5";
                    setProgress(100);
                    statusTextEl.textContent = "Redirecting, Please Wait...";

                    let reTimer = setInterval(() => {
                        remaining -= 100;
                        const secs = Math.ceil(remaining / 1000);
                        if (remaining >= 0) {
                            countdownEl.textContent = secs;
                            setProgress((remaining / duration) * 100);
                        } else {
                            clearInterval(reTimer);
                            countdownEl.textContent = "0";
                            setProgress(0);
                        }
                    }, 100);
                }

                function showSuccessAnimation() {
                    document.getElementById('timerBox').style.display = 'none';
                    document.getElementById('successCheck').style.display = 'block';
                    statusTextEl.style.color = '#38bdf8';
                    statusTextEl.textContent = "VERIFIED SUCCESSFULLY!";
                    haptic('success');
                }

                async function processVerify() {
                    haptic('impact');
                    const vBtn = document.getElementById('vBtn');
                    vBtn.disabled = true;
                    vBtn.innerHTML = "⏳ REDIRECTING...";

                    startSecondaryCountdown();

                    try {
                        const res = await fetch(\`/api/process-token?token=${cleanToken}&cf_token=\${encodeURIComponent(turnstileResponseToken)}\`);
                        const data = await res.json();
                        
                        setTimeout(() => {
                            if(data.success && data.url) {
                                showSuccessAnimation();
                                setTimeout(() => {
                                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                                        window.Telegram.WebApp.openLink(data.url);
                                        window.Telegram.WebApp.close();
                                    } else {
                                        window.location.href = data.url;
                                    }
                                }, 1200);
                            } else {
                                window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Verification Failed")}\`;
                            }
                        }, 4000);
                    } catch(e) {
                        setTimeout(() => {
                            window.location.href = "/access-denied?reason=Network Error";
                        }, 4000);
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

// ----------------------------------------------------------------------
// 2️⃣ STEP 2: GENERATE SHORTLINK & INIT TRACKING
// ----------------------------------------------------------------------
app.get('/api/process-token', async (req, res) => {
    const { token, cf_token } = req.query;

    if (!token || !cf_token) return res.json({ success: false, message: "Missing parameters" });

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
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken, is_used: false });

        if (!tokenDoc) {
            return res.json({ success: false, message: "Token already used or expired!" });
        }

        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { generated_at: Date.now(), is_completed: false, gate_passed: false } }
        );

        const settings = await db.collection('settings').findOne({ _id: "bot_settings" });
        if (!settings || !settings.shortlink_url || !settings.shortlink_api) {
            return res.json({ success: false, message: "Shortener configuration missing." });
        }

        const hostUrl = req.protocol + '://' + req.get('host');
        const targetProxyUrl = `${hostUrl}/gate?token=${cleanToken}`;

        const shortenerApiUrl = `https://${settings.shortlink_url}/api?api=${settings.shortlink_api}&url=${encodeURIComponent(targetProxyUrl)}&alias=${cleanToken}`;
        
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

// ----------------------------------------------------------------------
// 3️⃣ STEP 3: INTERMEDIATE ANTI-BYPASS GATE (/gate)
// ----------------------------------------------------------------------
app.get('/gate', async (req, res) => {
    const { token } = req.query;

    if (!token) return res.status(400).send(renderAccessDeniedUI("🚫 Missing token parameter."));

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc) {
            return res.status(403).send(renderAccessDeniedUI("⚡ Invalid or expired verification token."));
        }

        if (tokenDoc.is_used) {
            return res.status(403).send(renderAccessDeniedUI("⚠️ Token has already been claimed."));
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Security Verification</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            ${getWinterThemeStyles()}
            <style>
                .badge {
                    background-color: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);
                    padding: 8px 18px; border-radius: 20px; font-size: 0.85rem;
                    font-weight: 600; display: flex; align-items: center; gap: 6px;
                }
            </style>
        </head>
        <body>
            <div class="winter-bg"></div>
            <div class="fog-container"></div>

            <div class="card">
                <div class="timer-container">
                    <svg class="progress-ring" width="120" height="120">
                        <circle stroke="rgba(56, 189, 248, 0.15)" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                        <circle id="ring" class="progress-ring__circle" stroke="#38bdf8" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                    </svg>
                    <div id="countdown" class="number">5</div>
                </div>

                <h1 class="brand-title">Ac Premium</h1>
                <h2 class="section-title">Security Verification</h2>
                <p id="status-text" class="status-text">Verifying human...</p>

                <div class="badge">
                    <span>⚡</span> Ac Premium
                </div>
            </div>

            <div class="footer">
                © 2026 All Rights Reserved<br>
                Powered by <a href="https://t.me/pratilipifm0900" target="_blank" class="footer-link">GW KaLu</a>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                for(let i=0; i<25; i++) {
                    let flake = document.createElement('div');
                    flake.className = 'snowflake';
                    flake.innerHTML = '❄';
                    flake.style.left = Math.random() * 100 + 'vw';
                    flake.style.animationDuration = (Math.random() * 3 + 3) + 's';
                    flake.style.fontSize = (Math.random() * 10 + 10) + 'px';
                    document.body.appendChild(flake);
                }

                const circle = document.getElementById('ring');
                const countdownEl = document.getElementById('countdown');
                const statusTextEl = document.getElementById('status-text');

                const radius = circle.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = \`\${circumference} \${circumference}\`;

                const totalDuration = 5000;
                let timeRemaining = totalDuration;

                const countMsgs = {
                    5: "Validating Gate Request...",
                    4: "Connecting Security Nodes...",
                    3: "Verifying Anti-Bypass Keys...",
                    2: "Securing Token Payload...",
                    1: "Redirecting to Final Claim..."
                };

                function setProgress(percent) {
                    const offset = circumference - (percent / 100) * circumference;
                    circle.style.strokeDashoffset = offset;
                }
                setProgress(100);

                const timer = setInterval(() => {
                    timeRemaining -= 100;
                    const displaySeconds = Math.ceil(timeRemaining / 1000);
                    
                    if (timeRemaining >= 0) {
                        countdownEl.textContent = displaySeconds;
                        setProgress((timeRemaining / totalDuration) * 100);
                        if (countMsgs[displaySeconds]) {
                            statusTextEl.textContent = countMsgs[displaySeconds];
                        }
                    } else {
                        clearInterval(timer);
                        countdownEl.textContent = "0";
                        setProgress(0);
                        statusTextEl.textContent = "Redirecting...";
                        passGate();
                    }
                }, 100);

                async function passGate() {
                    try {
                        const res = await fetch(\`/api/pass-gate?token=${cleanToken}\`);
                        const data = await res.json();
                        if (data.success) {
                            window.location.href = \`/claim?token=${cleanToken}&hash=\${data.hash}\`;
                        } else {
                            window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Security Check Failed")}\`;
                        }
                    } catch(e) {
                        window.location.href = "/access-denied?reason=Gate Connection Error";
                    }
                }
            </script>
        </body>
        </html>
        `);
    } catch (err) {
        console.error("Gate Route Error:", err);
        return res.status(500).send(renderAccessDeniedUI("Gate Security Check Error."));
    }
});

// Secure Pass Gate API
app.get('/api/pass-gate', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.json({ success: false, message: "Missing token." });

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) {
            return res.json({ success: false, message: "Invalid or used token." });
        }

        const timestamp = Date.now();
        const hash = generateSecureHash(cleanToken, timestamp);

        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { gate_passed: true, gate_hash: hash, gate_time: timestamp } }
        );

        return res.json({ success: true, hash });
    } catch(e) {
        return res.json({ success: false, message: "Gate pass failed." });
    }
});

// ----------------------------------------------------------------------
// 4️⃣ STEP 4: CLAIM PAGE (/claim)
// ----------------------------------------------------------------------
app.get('/claim', async (req, res) => {
    const { token, hash } = req.query;

    if (!token || !hash) return res.status(400).send(renderAccessDeniedUI("🚫 Direct access strictly blocked. Complete verification process first."));

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc) return res.status(403).send(renderAccessDeniedUI("⚡ Invalid or expired token."));
        if (tokenDoc.is_used) return res.status(403).send(renderAccessDeniedUI("⚠️ Token has already been claimed."));

        const expectedHash = generateSecureHash(cleanToken, tokenDoc.gate_time);
        if (!tokenDoc.gate_passed || tokenDoc.gate_hash !== hash || hash !== expectedHash) {
            return res.status(403).send(renderAccessDeniedUI("🛡️ BYPASS DETECTED: Invalid Security Hash."));
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Claim Security Gateway</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            ${getWinterThemeStyles()}
        </head>
        <body>
            <div class="winter-bg"></div>
            <div class="fog-container"></div>

            <div class="card">
                <div id="timerBox" class="timer-container">
                    <svg class="progress-ring" width="120" height="120">
                        <circle stroke="rgba(56, 189, 248, 0.15)" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                        <circle id="ring" class="progress-ring__circle" stroke="#38bdf8" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                    </svg>
                    <div id="countdown" class="number">5</div>
                </div>

                <div id="successCheck" class="success-checkmark">
                    <div class="check-icon">
                        <span class="icon-line line-tip"></span>
                        <span class="icon-line line-long"></span>
                    </div>
                </div>

                <h1 class="brand-title">Ac Premium</h1>
                <h2 class="section-title">Final Check</h2>
                <p id="statusText" class="status-text">Initializing session...</p>

                <div style="width: 100%;">
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-theme="dark" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onClaimCaptcha"></div>
                    </div>
                    <button id="claimBtn" class="btn" onclick="executeClaim()" disabled>🎁 CLAIM YOUR TOKEN</button>
                </div>
            </div>

            <div class="footer">
                © 2026 All Rights Reserved<br>
                Powered by <a href="https://t.me/pratilipifm0900" target="_blank" class="footer-link">GW KaLu</a>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                function haptic(type) {
                    try {
                        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                            if (type === 'success') window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                            else if (type === 'impact') window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                            else if (type === 'light') window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                        }
                    } catch(e){}
                }

                for(let i=0; i<25; i++) {
                    let flake = document.createElement('div');
                    flake.className = 'snowflake';
                    flake.innerHTML = '❄';
                    flake.style.left = Math.random() * 100 + 'vw';
                    flake.style.animationDuration = (Math.random() * 3 + 3) + 's';
                    flake.style.fontSize = (Math.random() * 10 + 10) + 'px';
                    document.body.appendChild(flake);
                }

                const circle = document.getElementById('ring');
                const countdownEl = document.getElementById('countdown');
                const statusTextEl = document.getElementById('statusText');

                const radius = circle.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = \`\${circumference} \${circumference}\`;

                const countMsgs = {
                    5: "Preparing reward token...",
                    4: "Verifying Captcha Token...",
                    3: "Authorizing Telegram Protocol...",
                    2: "Finalizing Token Release...",
                    1: "Ready to Claim!"
                };

                let totalDuration = 5000;
                let timeRemaining = totalDuration;

                function setProgress(percent) {
                    const offset = circumference - (percent / 100) * circumference;
                    circle.style.strokeDashoffset = offset;
                }
                setProgress(100);

                let timer = setInterval(() => {
                    timeRemaining -= 100;
                    const displaySeconds = Math.ceil(timeRemaining / 1000);
                    
                    if (timeRemaining >= 0) {
                        countdownEl.textContent = displaySeconds;
                        setProgress((timeRemaining / totalDuration) * 100);
                        if (countMsgs[displaySeconds]) {
                            statusTextEl.textContent = countMsgs[displaySeconds];
                        }
                    } else {
                        clearInterval(timer);
                        countdownEl.textContent = "0";
                        setProgress(0);
                        statusTextEl.textContent = "Click button below";
                    }
                }, 100);

                let claimCaptchaToken = "";
                function onClaimCaptcha(token) {
                    haptic('light');
                    claimCaptchaToken = token;
                    document.getElementById('claimBtn').disabled = false;
                }

                function startSecondaryCountdown() {
                    let duration = 5000;
                    let remaining = duration;
                    countdownEl.textContent = "5";
                    setProgress(100);
                    statusTextEl.textContent = "Finalizing Claim, Please Wait...";

                    let reTimer = setInterval(() => {
                        remaining -= 100;
                        const secs = Math.ceil(remaining / 1000);
                        if (remaining >= 0) {
                            countdownEl.textContent = secs;
                            setProgress((remaining / duration) * 100);
                        } else {
                            clearInterval(reTimer);
                            countdownEl.textContent = "0";
                            setProgress(0);
                        }
                    }, 100);
                }

                function showSuccessAnimation() {
                    document.getElementById('timerBox').style.display = 'none';
                    document.getElementById('successCheck').style.display = 'block';
                    statusTextEl.style.color = '#38bdf8';
                    statusTextEl.textContent = "CLAIM SUCCESSFUL!";
                    haptic('success');
                }

                async function executeClaim() {
                    haptic('impact');
                    const btn = document.getElementById('claimBtn');
                    btn.disabled = true;
                    btn.innerHTML = "⏳ REDIRECTING...";

                    startSecondaryCountdown();

                    try {
                        const res = await fetch(\`/api/execute-claim?token=${cleanToken}&hash=${hash}&cf_token=\${encodeURIComponent(claimCaptchaToken)}\`);
                        const data = await res.json();

                        setTimeout(() => {
                            if (data.success && data.url) {
                                showSuccessAnimation();
                                setTimeout(() => {
                                    if (window.Telegram && window.Telegram.WebApp) {
                                        if (window.Telegram.WebApp.openTelegramLink) {
                                            window.Telegram.WebApp.openTelegramLink(data.url);
                                        } else if (window.Telegram.WebApp.openLink) {
                                            window.Telegram.WebApp.openLink(data.url);
                                        } else {
                                            window.location.href = data.url;
                                        }
                                        window.Telegram.WebApp.close();
                                    } else {
                                        window.location.href = data.url;
                                    }
                                }, 1200);
                            } else {
                                window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Security Verification Failed")}\`;
                            }
                        }, 4000);
                    } catch(e) {
                        setTimeout(() => {
                            window.location.href = "/access-denied?reason=Network verification error";
                        }, 4000);
                    }
                }
            </script>
        </body>
        </html>
        `);

    } catch (err) {
        console.error("Claim Route Error:", err);
        return res.status(500).send(renderAccessDeniedUI("Internal Security Check Error."));
    }
});

// ----------------------------------------------------------------------
// 5️⃣ STEP 5: FINAL BACKEND CLAIM CHECK
// ----------------------------------------------------------------------
app.get('/api/execute-claim', async (req, res) => {
    const { token, hash, cf_token } = req.query;

    if (!token || !hash || !cf_token) return res.json({ success: false, message: "Token/Hash/Captcha missing." });

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) {
            return res.json({ success: false, message: "Invalid or already used token." });
        }

        if (REQUIRE_POSTBACK && !tokenDoc.is_completed) {
            return res.json({ 
                success: false, 
                message: "🚫 BYPASS DETECTED: Shortlink task was skipped or not completed via Official Site!" 
            });
        }

        const expectedHash = generateSecureHash(cleanToken, tokenDoc.gate_time);
        if (!tokenDoc.gate_passed || tokenDoc.gate_hash !== hash || hash !== expectedHash) {
            return res.json({ success: false, message: "BYPASS DETECTED! Security Hash Mismatch." });
        }

        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const cfResponse = await axios.post(verifyUrl, new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: cf_token
        }));

        if (!cfResponse.data.success) {
            return res.json({ success: false, message: "Security Captcha verification failed!" });
        }

        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { is_used: true, claimed_at: Date.now() } }
        );

        const settings = await db.collection('settings').findOne({ _id: "bot_settings" });
        let rawBotUsername = (settings && settings.bot_username) || "SmartfilestorebyAcbot";
        const botUsername = rawBotUsername.replace(/^@/, '');

        const targetTelegramUrl = `https://t.me/${botUsername}?start=verify_${cleanToken}`;

        return res.json({ success: true, url: targetTelegramUrl });

    } catch (err) {
        console.error("Execute Claim Error:", err);
        return res.json({ success: false, message: "Server execution error." });
    }
});

// ----------------------------------------------------------------------
// 6️⃣ STEP 6: POSTBACK RECEIVER (Webhook)
// ----------------------------------------------------------------------
app.get('/api/postback', async (req, res) => {
    const { token, secret } = req.query;

    if (secret !== POSTBACK_SECRET) return res.status(401).send("Unauthorized Access");
    if (!token) return res.status(400).send("Missing token parameter");

    try {
        const cleanToken = token.trim();
        const updateResult = await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { is_completed: true, postback_at: Date.now() } }
        );

        if (updateResult.matchedCount === 0) return res.status(404).send("Token not found");

        console.log(`✅ Webhook Received Successfully for Token: ${cleanToken}`);
        return res.status(200).send("OK");
    } catch (err) {
        console.error("Postback Processing Error:", err);
        return res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => console.log(`Proxy server listening on port ${PORT}`));
