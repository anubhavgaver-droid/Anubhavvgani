const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

const DB_NAME = process.env.DB_NAME || "Cluovvoo";

const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEW2Ci6bkvsSt9JE";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "0x4AAAAAAEW2CrKKwntMxBfDSRfXUr48arA";
const POSTBACK_SECRET = process.env.POSTBACK_SECRET || "MY_SUPER_SECRET_KEY_123";

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
                --bg-color: #07090e; --card-bg: rgba(13, 17, 23, 0.85);
                --cyan-glow: #00f3ff; --red-glow: #ff0055; --red-dim: rgba(255, 0, 85, 0.15);
                --text-main: #e6edf3; --text-sub: #8b949e;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', -apple-system, sans-serif; }
            body {
                background-color: var(--bg-color); color: var(--text-main);
                display: flex; justify-content: center; align-items: center;
                min-height: 100vh; padding: 20px; overflow: hidden;
            }
            .hud-card {
                position: relative; z-index: 1; width: 100%; max-width: 400px;
                background: var(--card-bg); backdrop-filter: blur(16px);
                border: 1px solid rgba(0, 243, 255, 0.25); border-radius: 16px;
                padding: 28px 24px; text-align: center;
                box-shadow: 0 0 30px rgba(0, 243, 255, 0.1);
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
                background: rgba(0, 0, 0, 0.4); border-left: 3px solid var(--cyan-glow);
                border-radius: 6px; padding: 14px; text-align: left; margin-bottom: 24px;
            }
            .reason-title { font-size: 10px; text-transform: uppercase; color: var(--cyan-glow); letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; }
            .reason-text { font-size: 13px; color: var(--text-main); font-weight: 500; }
            .btn-action {
                display: block; width: 100%; padding: 12px; border-radius: 8px;
                background: linear-gradient(135deg, rgba(0, 243, 255, 0.2) 0%, rgba(0, 243, 255, 0.05) 100%);
                border: 1px solid var(--cyan-glow); color: var(--cyan-glow);
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
                .card {
                    background: rgba(19, 27, 46, 0.85); backdrop-filter: blur(12px);
                    border: 1px solid rgba(0, 243, 255, 0.3); border-radius: 16px;
                    padding: 28px 20px; text-align: center; width: 90%; max-width: 380px;
                    box-shadow: 0 0 25px rgba(0, 243, 255, 0.15);
                }
                h2 { font-size: 20px; letter-spacing: 1px; margin-bottom: 8px; color: #fff; }
                p.sub { color: #8b949e; font-size: 12px; margin-bottom: 18px; text-transform: uppercase; }
                .turnstile-container { display: flex; justify-content: center; margin-bottom: 18px; }
                .btn {
                    background: linear-gradient(135deg, #00f3ff 0%, #00a6ff 100%);
                    color: #000; border: none; padding: 14px 28px; font-size: 15px; font-weight: bold;
                    border-radius: 8px; cursor: pointer; width: 100%; transition: 0.3s ease;
                }
                .btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; }
                .hidden { display: none; }
                .spinner-wrapper {
                    position: relative; width: 65px; height: 65px;
                    margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;
                }
                .spinner {
                    position: absolute; width: 100%; height: 100%;
                    border: 4px solid #1e293b; border-top: 4px solid #00f3ff;
                    border-radius: 50%; animation: spin 1s linear infinite;
                }
                .timer-count { font-size: 22px; font-weight: 800; color: #00f3ff; z-index: 2; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .status { margin-top: 12px; color: #00f3ff; font-size: 13px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div id="step1">
                    <h2>SECURE VERIFICATION</h2>
                    <p class="sub">PLEASE COMPLETE THIS INITIAL CHECK 🎴</p>
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-theme="dark" data-callback="onCaptchaSuccess"></div>
                    </div>
                    <button id="vBtn" class="btn" onclick="processVerify()" disabled>VERIFY NOW</button>
                    <div id="status" class="status">Please complete captcha above</div>
                </div>

                <div id="step2" class="hidden">
                    <div class="spinner-wrapper">
                        <div class="spinner"></div>
                        <span id="timerCount" class="timer-count">3</span>
                    </div>
                    <h2>REDIRECTING...</h2>
                    <p id="statusMsg" class="sub">PREPARING SHORTLINK DESTINATION...</p>
                </div>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                let turnstileResponseToken = "";
                function onCaptchaSuccess(token) {
                    turnstileResponseToken = token;
                    document.getElementById('vBtn').disabled = false;
                    document.getElementById('status').innerText = "";
                }

                let destinationUrl = "";

                async function processVerify() {
                    if (!turnstileResponseToken) return alert("Please complete Captcha!");

                    const btn = document.getElementById('vBtn');
                    btn.disabled = true; btn.innerText = "INITIALIZING...";

                    try {
                        const res = await fetch(\`/api/process-token?token=${cleanToken}&cf_token=\${encodeURIComponent(turnstileResponseToken)}\`);
                        const data = await res.json();
                        
                        if(data.success && data.url) {
                            destinationUrl = data.url;
                            startCountdown();
                        } else {
                            alert(data.message || "Verification Failed!");
                            if (window.turnstile) window.turnstile.reset();
                            btn.disabled = true; btn.innerText = "VERIFY NOW";
                        }
                    } catch(e) {
                        alert("Network Error!");
                        btn.disabled = true; btn.innerText = "VERIFY NOW";
                    }
                }

                function startCountdown() {
                    document.getElementById('step1').classList.add('hidden');
                    document.getElementById('step2').classList.remove('hidden');

                    let seconds = 3;
                    const timerCount = document.getElementById('timerCount');
                    const timer = setInterval(() => {
                        seconds--;
                        if (seconds >= 0) timerCount.innerText = seconds;
                        if (seconds < 0) {
                            clearInterval(timer);
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
        // शॉर्टलिंक का फाइनल टारगेट अब /gate रहेगा (/claim नहीं)
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
// 3️⃣ STEP 3: INTERMEDIATE ANTI-BYPASS GATE (न्यू इमिटेटर/फिल्टर)
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
            <title>Anti-Bypass Inspection</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background: #07090e; color: white;
                    font-family: 'Segoe UI', -apple-system, sans-serif;
                    display: flex; justify-content: center; align-items: center;
                    min-height: 100vh; overflow: hidden;
                }
                .card {
                    background: rgba(13, 17, 23, 0.9); backdrop-filter: blur(16px);
                    border: 1px solid rgba(0, 243, 255, 0.3); border-radius: 16px;
                    padding: 30px 24px; text-align: center; width: 90%; max-width: 380px;
                    box-shadow: 0 0 30px rgba(0, 243, 255, 0.15);
                }
                h2 { font-size: 18px; color: #00f3ff; margin-bottom: 6px; letter-spacing: 1px; }
                p.sub { color: #8b949e; font-size: 12px; margin-bottom: 20px; }
                .progress-bar {
                    width: 100%; height: 8px; background: rgba(255,255,255,0.1);
                    border-radius: 4px; overflow: hidden; margin-bottom: 15px; position: relative;
                }
                .fill { width: 0%; height: 100%; background: #00f3ff; transition: width 0.1s linear; }
                .status-log { font-size: 11px; color: #10b981; font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🔍 INSPECTING TRAFFIC...</h2>
                <p class="sub">Analyzing browser environment & human signals...</p>
                <div class="progress-bar"><div id="progress" class="fill"></div></div>
                <div id="log" class="status-log">Checking Headless Drivers...</div>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                // Browser Fingerprinting Check (Bot Detection)
                function isBot() {
                    const isHeadless = navigator.webdriver || !navigator.languages || navigator.languages.length === 0;
                    const hasInvalidScreen = window.outerWidth === 0 && window.outerHeight === 0;
                    return isHeadless || hasInvalidScreen;
                }

                let percent = 0;
                const progress = document.getElementById('progress');
                const log = document.getElementById('log');

                const interval = setInterval(() => {
                    percent += 5;
                    progress.style.width = percent + '%';

                    if (percent === 30) log.innerText = "Verifying Screen Resolution & Touch API...";
                    if (percent === 70) log.innerText = "Establishing Anti-Bypass Handshake...";

                    if (percent >= 100) {
                        clearInterval(interval);
                        if (isBot()) {
                            alert("Bypass Bot Detected!");
                            return;
                        }
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
                            alert(data.message || "Security Inspection Failed.");
                        }
                    } catch(e) {
                        alert("Gate connection error.");
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

// Gate Verification Handshake API
app.get('/api/pass-gate', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.json({ success: false, message: "Missing token." });

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) {
            return res.json({ success: false, message: "Invalid token." });
        }

        // Generate dynamic Hash
        const hash = Buffer.from(`${cleanToken}_GATE_PASSED_${Date.now()}`).toString('base64');

        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { gate_passed: true, gate_hash: hash, gate_time: Date.now() } }
        );

        return res.json({ success: true, hash });
    } catch(e) {
        return res.json({ success: false, message: "Gate pass failed." });
    }
});

// ----------------------------------------------------------------------
// 4️⃣ STEP 4: CLAIM PAGE (गेट पास होने के बाद ही खुलेगा)
// ----------------------------------------------------------------------
app.get('/claim', async (req, res) => {
    const { token, hash } = req.query;

    if (!token || !hash) return res.status(400).send(renderAccessDeniedUI("🚫 Direct access strictly blocked. Complete verification process first."));

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc) return res.status(403).send(renderAccessDeniedUI("⚡ Invalid or expired token."));
        if (tokenDoc.is_used) return res.status(403).send(renderAccessDeniedUI("⚠️ Token has already been claimed."));

        // strict hash match
        if (!tokenDoc.gate_passed || tokenDoc.gate_hash !== hash) {
            return res.status(403).send(renderAccessDeniedUI("🛡️ BYPASS DETECTED: Intermediate gate security bypassed."));
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Claim Gateway</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background: #0b0f19; color: white;
                    font-family: 'Segoe UI', -apple-system, sans-serif;
                    display: flex; justify-content: center; align-items: center;
                    min-height: 100vh; overflow: hidden;
                }
                .card {
                    background: rgba(19, 27, 46, 0.85); backdrop-filter: blur(12px);
                    border: 1px solid rgba(0, 243, 255, 0.3); border-radius: 16px;
                    padding: 28px 20px; text-align: center; width: 90%; max-width: 380px;
                    box-shadow: 0 0 25px rgba(0, 243, 255, 0.15);
                }
                h2 { font-size: 20px; color: #fff; margin-bottom: 8px; }
                p.sub { color: #8b949e; font-size: 12px; margin-bottom: 18px; text-transform: uppercase; }
                .btn {
                    background: linear-gradient(135deg, #00f3ff 0%, #00a6ff 100%);
                    color: #000; border: none; padding: 14px 28px; font-size: 15px; font-weight: bold;
                    border-radius: 8px; cursor: pointer; width: 100%; transition: 0.3s ease;
                }
                .hidden { display: none; }
                .spinner-wrapper {
                    position: relative; width: 65px; height: 65px; margin: 0 auto 20px;
                    display: flex; align-items: center; justify-content: center;
                }
                .spinner {
                    position: absolute; width: 100%; height: 100%;
                    border: 4px solid #1e293b; border-top: 4px solid #00f3ff;
                    border-radius: 50%; animation: spin 1s linear infinite;
                }
                .timer-count { font-size: 22px; font-weight: 800; color: #00f3ff; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .denied-box {
                    background: rgba(255, 0, 85, 0.1); border: 1px solid #ff0055;
                    border-radius: 8px; padding: 15px; margin-bottom: 15px; color: #ff0055;
                    font-size: 13px; font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div id="checkStep">
                    <div class="spinner-wrapper">
                        <div class="spinner"></div>
                        <span id="scanCount" class="timer-count">3</span>
                    </div>
                    <h2>VERIFYING TASK...</h2>
                    <p class="sub">VERIFYING COMPLETION WITH SECURITY GATEWAY...</p>
                    
                    <div class="cf-turnstile" 
                         data-sitekey="${TURNSTILE_SITE_KEY}" 
                         data-theme="dark" 
                         data-size="compact"
                         data-callback="onClaimCaptchaSuccess"></div>
                </div>

                <div id="claimStep" class="hidden">
                    <h2 style="color:#10b981;">✓ TASK VERIFIED</h2>
                    <p class="sub">CLICK BELOW TO CLAIM YOUR TOKEN IN BOT</p>
                    <button id="claimBtn" class="btn" onclick="executeClaim()">🎁 CLAIM YOUR TOKEN</button>
                </div>

                <div id="deniedStep" class="hidden">
                    <div class="denied-box">[ ACCESS RESTRICTED ]</div>
                    <h2>VERIFICATION FAILED</h2>
                    <p id="deniedReason" class="sub" style="color:#ef4444;"></p>
                    <a href="https://t.me/SmartfilestorebyAcbot" class="btn" style="text-decoration:none; display:block;">🔄 GET NEW LINK</a>
                </div>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                let claimCaptchaToken = "";
                function onClaimCaptchaSuccess(token) {
                    claimCaptchaToken = token;
                }

                let scanSeconds = 3;
                const scanCount = document.getElementById('scanCount');
                
                const scanTimer = setInterval(() => {
                    scanSeconds--;
                    if (scanSeconds >= 0) scanCount.innerText = scanSeconds;

                    if (scanSeconds < 0) {
                        clearInterval(scanTimer);
                        verifyTaskCompletion();
                    }
                }, 1000);

                let finalBotUrl = "";

                async function verifyTaskCompletion() {
                    try {
                        const res = await fetch(\`/api/execute-claim?token=${cleanToken}&hash=${hash}&cf_token=\${encodeURIComponent(claimCaptchaToken)}\`);
                        const data = await res.json();

                        document.getElementById('checkStep').classList.add('hidden');

                        if (data.success && data.url) {
                            finalBotUrl = data.url;
                            document.getElementById('claimStep').classList.remove('hidden');
                        } else {
                            document.getElementById('deniedReason').innerText = data.message || "Bypass bot detected or security check failed.";
                            document.getElementById('deniedStep').classList.remove('hidden');
                        }
                    } catch(e) {
                        document.getElementById('checkStep').classList.add('hidden');
                        document.getElementById('deniedReason').innerText = "Network verification error.";
                        document.getElementById('deniedStep').classList.remove('hidden');
                    }
                }

                function executeClaim() {
                    if (finalBotUrl) {
                        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                            window.Telegram.WebApp.openLink(finalBotUrl);
                            window.Telegram.WebApp.close();
                        } else {
                            window.location.href = finalBotUrl;
                        }
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
// 5️⃣ STEP 5: FINAL BACKEND CLAIM CHECK (/api/execute-claim)
// ----------------------------------------------------------------------
app.get('/api/execute-claim', async (req, res) => {
    const { token, hash, cf_token } = req.query;

    if (!token || !hash) return res.json({ success: false, message: "Token/Hash missing." });

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) {
            return res.json({ success: false, message: "Invalid or already used token." });
        }

        // 🛡️ 1. Gate Hash verification
        if (!tokenDoc.gate_passed || tokenDoc.gate_hash !== hash) {
            return res.json({ success: false, message: "BYPASS DETECTED! Intermediary gate skipped." });
        }

        // 🛡️ 2. Minimum Time Gap Check (3 सेकंड से पहले रिक्वेस्ट आई तो बोट माना जाएगा)
        const gateTimeDiff = Date.now() - (tokenDoc.gate_time || 0);
        if (gateTimeDiff < 2500) {
            return res.json({ success: false, message: "BYPASS DETECTED! Unnaturally fast execution speed." });
        }

        // 🛡️ 3. Turnstile Captcha Check
        if (cf_token) {
            const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
            const cfResponse = await axios.post(verifyUrl, new URLSearchParams({
                secret: TURNSTILE_SECRET_KEY,
                response: cf_token
            }));

            if (!cfResponse.data.success) {
                return res.json({ success: false, message: "Security Captcha verification failed!" });
            }
        }

        // Mark token as used
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
// 6️⃣ STEP 6: POSTBACK RECEIVER (IF AVAILABLE)
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
