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
                --bg-color: #121212; --card-bg: #1a1a1a;
                --yellow-glow: #ffcc00; --red-glow: #ff0055; --red-dim: rgba(255, 0, 85, 0.15);
                --text-main: #ffffff; --text-sub: #a0a0a0;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body {
                background-color: var(--bg-color); color: var(--text-main);
                display: flex; justify-content: center; align-items: center;
                min-height: 100vh; padding: 20px; overflow: hidden;
            }
            .hud-card {
                position: relative; z-index: 1; width: 320px;
                background: var(--card-bg); border: 1px solid #2d2d2d;
                border-radius: 28px; padding: 35px 20px; text-align: center;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
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
                background: rgba(0, 0, 0, 0.4); border-left: 3px solid var(--yellow-glow);
                border-radius: 6px; padding: 14px; text-align: left; margin-bottom: 24px;
            }
            .reason-title { font-size: 10px; text-transform: uppercase; color: var(--yellow-glow); letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; }
            .reason-text { font-size: 13px; color: var(--text-main); font-weight: 500; }
            .btn-action {
                display: block; width: 100%; padding: 12px; border-radius: 20px;
                background: #2b250d; border: 1px solid #4a3e0f; color: #ffcc00;
                font-weight: 600; font-size: 14px; text-decoration: none; transition: 0.3s ease;
            }
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
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                body {
                    background-color: #121212; display: flex; justify-content: center;
                    align-items: center; min-height: 100vh; overflow: hidden;
                }
                .card {
                    background-color: #1a1a1a; border: 1px solid #2d2d2d;
                    border-radius: 28px; width: 320px; padding: 35px 20px;
                    display: flex; flex-direction: column; align-items: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
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
                }
                .number { position: absolute; font-size: 2.2rem; font-weight: 700; color: #ffcc00; }
                .brand-title { color: #ffcc00; font-size: 1.1rem; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; }
                .section-title { color: #ffffff; font-size: 1.3rem; font-weight: 600; margin-bottom: 8px; }
                .status-text { color: #a0a0a0; font-size: 0.85rem; margin-bottom: 20px; }
                
                .turnstile-container { display: flex; justify-content: center; margin-bottom: 18px; width: 100%; }
                .btn {
                    background: #ffcc00; color: #000; border: none; padding: 12px 20px;
                    font-size: 14px; font-weight: bold; border-radius: 20px;
                    cursor: pointer; width: 100%; transition: 0.3s;
                }
                .btn:disabled { background: #333; color: #777; cursor: not-allowed; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="timer-container">
                    <svg class="progress-ring" width="120" height="120">
                        <circle stroke="#332a00" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                        <circle id="ring" class="progress-ring__circle" stroke="#ffcc00" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                    </svg>
                    <div id="countdown" class="number">5</div>
                </div>

                <h1 class="brand-title">Ac Premium</h1>
                <h2 class="section-title">Security Check</h2>
                <p id="statusText" class="status-text">Verifying human...</p>

                <div id="verify-form" style="width: 100%;">
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-theme="dark" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onCaptchaSuccess"></div>
                    </div>
                    <button id="vBtn" class="btn" onclick="processVerify()" disabled>VERIFY & CONTINUE</button>
                </div>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                const circle = document.getElementById('ring');
                const countdownEl = document.getElementById('countdown');
                const statusTextEl = document.getElementById('statusText');

                const radius = circle.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = \`\${circumference} \${circumference}\`;

                const totalDuration = 5000; // 5 Seconds
                let timeRemaining = totalDuration;

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
                        if (displaySeconds === 1) statusTextEl.textContent = "Checking connection...";
                    } else {
                        clearInterval(timer);
                        countdownEl.textContent = "0";
                        setProgress(0);
                        statusTextEl.textContent = "Complete Security Check";
                    }
                }, 100);

                let turnstileResponseToken = "";
                function onCaptchaSuccess(token) {
                    turnstileResponseToken = token;
                    document.getElementById('vBtn').disabled = false;
                }

                async function processVerify() {
                    const vBtn = document.getElementById('vBtn');
                    vBtn.disabled = true;
                    statusTextEl.textContent = "Processing...";

                    try {
                        const res = await fetch(\`/api/process-token?token=${cleanToken}&cf_token=\${encodeURIComponent(turnstileResponseToken)}\`);
                        const data = await res.json();
                        
                        if(data.success && data.url) {
                            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                                window.Telegram.WebApp.openLink(data.url);
                                window.Telegram.WebApp.close();
                            } else {
                                window.location.href = data.url;
                            }
                        } else {
                            window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Verification Failed")}\`;
                        }
                    } catch(e) {
                        window.location.href = "/access-denied?reason=Network Error";
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
// 2️⃣ STEP 2: GENERATE SHORTLINK & INIT TRACKING (UPDATED WITH ALIAS)
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

        // ⚡ UPDATED LINE: Added &alias=${cleanToken} so shortener generates exact 12-13 digit token link
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
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                body {
                    background-color: #121212; display: flex; justify-content: center;
                    align-items: center; min-height: 100vh; overflow: hidden;
                }
                .card {
                    background-color: #1a1a1a; border: 1px solid #2d2d2d;
                    border-radius: 28px; width: 320px; padding: 35px 20px;
                    display: flex; flex-direction: column; align-items: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                }
                .timer-container {
                    position: relative; width: 120px; height: 120px;
                    display: flex; justify-content: center; align-items: center;
                    margin-bottom: 25px;
                }
                .progress-ring { transform: rotate(-90deg); }
                .progress-ring__circle {
                    stroke-dasharray: 314.159; stroke-dashoffset: 0;
                    transition: stroke-dashoffset 0.1s linear; stroke-linecap: round;
                }
                .number { position: absolute; font-size: 2.2rem; font-weight: 700; color: #ffcc00; }
                .brand-title { color: #ffcc00; font-size: 1.1rem; letter-spacing: 1px; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; }
                .section-title { color: #ffffff; font-size: 1.3rem; font-weight: 600; margin-bottom: 12px; }
                .status-text { color: #a0a0a0; font-size: 0.9rem; margin-bottom: 25px; }
                .badge {
                    background-color: #2b250d; color: #ffcc00; border: 1px solid #4a3e0f;
                    padding: 8px 18px; border-radius: 20px; font-size: 0.85rem;
                    font-weight: 600; display: flex; align-items: center; gap: 6px;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="timer-container">
                    <svg class="progress-ring" width="120" height="120">
                        <circle stroke="#332a00" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                        <circle id="ring" class="progress-ring__circle" stroke="#ffcc00" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
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

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                const circle = document.getElementById('ring');
                const countdownEl = document.getElementById('countdown');
                const statusTextEl = document.getElementById('status-text');

                const radius = circle.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = \`\${circumference} \${circumference}\`;

                const totalDuration = 5000; // 5 Seconds
                let timeRemaining = totalDuration;

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
                        if (displaySeconds === 1) statusTextEl.textContent = "Checking connection...";
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
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                body {
                    background-color: #121212; display: flex; justify-content: center;
                    align-items: center; min-height: 100vh; overflow: hidden;
                }
                .card {
                    background-color: #1a1a1a; border: 1px solid #2d2d2d;
                    border-radius: 28px; width: 320px; padding: 35px 20px;
                    display: flex; flex-direction: column; align-items: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
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
                }
                .number { position: absolute; font-size: 2.2rem; font-weight: 700; color: #ffcc00; }
                .brand-title { color: #ffcc00; font-size: 1.1rem; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; }
                .section-title { color: #ffffff; font-size: 1.3rem; font-weight: 600; margin-bottom: 8px; }
                .status-text { color: #a0a0a0; font-size: 0.85rem; margin-bottom: 20px; }
                
                .turnstile-container { display: flex; justify-content: center; margin-bottom: 18px; width: 100%; }
                .btn {
                    background: #ffcc00; color: #000; border: none; padding: 12px 20px;
                    font-size: 14px; font-weight: bold; border-radius: 20px;
                    cursor: pointer; width: 100%; transition: 0.3s;
                }
                .btn:disabled { background: #333; color: #777; cursor: not-allowed; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="timer-container">
                    <svg class="progress-ring" width="120" height="120">
                        <circle stroke="#332a00" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                        <circle id="ring" class="progress-ring__circle" stroke="#ffcc00" stroke-width="6" fill="transparent" r="50" cx="60" cy="60"/>
                    </svg>
                    <div id="countdown" class="number">5</div>
                </div>

                <h1 class="brand-title">Ac Premium</h1>
                <h2 class="section-title">Final Check</h2>
                <p id="statusText" class="status-text">Verifying human...</p>

                <div style="width: 100%;">
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-theme="dark" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onClaimCaptcha"></div>
                    </div>
                    <button id="claimBtn" class="btn" onclick="executeClaim()" disabled>🎁 CLAIM YOUR TOKEN</button>
                </div>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                const circle = document.getElementById('ring');
                const countdownEl = document.getElementById('countdown');
                const statusTextEl = document.getElementById('statusText');

                const radius = circle.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = \`\${circumference} \${circumference}\`;

                const totalDuration = 5000; // 5 Seconds
                let timeRemaining = totalDuration;

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
                        if (displaySeconds === 1) statusTextEl.textContent = "Checking connection...";
                    } else {
                        clearInterval(timer);
                        countdownEl.textContent = "0";
                        setProgress(0);
                        statusTextEl.textContent = "Click button below";
                    }
                }, 100);

                let claimCaptchaToken = "";
                function onClaimCaptcha(token) {
                    claimCaptchaToken = token;
                    document.getElementById('claimBtn').disabled = false;
                }

                async function executeClaim() {
                    const btn = document.getElementById('claimBtn');
                    btn.disabled = true;
                    statusTextEl.textContent = "VERIFYING...";

                    try {
                        const res = await fetch(\`/api/execute-claim?token=${cleanToken}&hash=${hash}&cf_token=\${encodeURIComponent(claimCaptchaToken)}\`);
                        const data = await res.json();

                        if (data.success && data.url) {
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
                        } else {
                            window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Security Verification Failed")}\`;
                        }
                    } catch(e) {
                        window.location.href = "/access-denied?reason=Network verification error";
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
