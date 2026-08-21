const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

const DB_NAME = process.env.DB_NAME || "Cluovvoo";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "super_secret_anti_bypass_key_123890";

const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEW2Ci6bkvsSt9JE";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "0x4AAAAAAEW2CrKKwntMxBfDSRfXUr48arA";

// Enable Trust Proxy for platforms like Render, Heroku, Cloudflare
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET)); // Encrypted/Signed Cookies Support

let db;

// 🛡️ Rate Limiter: DDoS और स्पैम अटैक से सुरक्षा
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 30, 
    message: { success: false, message: "Too many requests. Please slow down." }
});

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

// Helper: Real Client IP निकालना
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

// Keep-Alive / Health Check Routes
app.get('/ping', (req, res) => res.status(200).send('SERVER_AWAKE'));
app.get('/', (req, res) => res.status(200).send('Zender Proxy Server is Active'));

app.use(async (req, res, next) => {
    await connectDB();
    if (!db) {
        return res.status(500).send("Database Connection Error. Please refresh.");
    }
    next();
});

// 🔴 UI Template: Access Denied / Token Already Used
function renderAccessDeniedUI(reasonText, titleText = "Verification Failed") {
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
            <h1 class="title">${titleText}</h1>
            <p class="subtitle">Access restricted by security gateway.</p>
            <div class="reason-box">
                <div class="reason-title">SYSTEM STATUS:</div>
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
// 1️⃣ STEP 1: VERIFICATION PAGE (/verify)
// ----------------------------------------------------------------------
app.get('/verify', apiLimiter, async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send(renderAccessDeniedUI("🚫 Missing or invalid token parameter."));
    }

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        // ❌ अगर टोकन डेटाबेस में है ही नहीं
        if (!tokenDoc) {
            return res.status(404).send(renderAccessDeniedUI("⚡ Invalid Token or Link Expired."));
        }

        // ❌ अगर टोकन पहले ही यूज़ (Claim) हो चुका है (EXPLICIT CHECK)
        if (tokenDoc.is_used) {
            return res.status(403).send(
                renderAccessDeniedUI("⚠️ LINK ALREADY USED! This verification token has already been completed and claimed. Please generate a new link from Telegram Bot.", "Token Already Used")
            );
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
                    position: relative; z-index: 2;
                    background: rgba(19, 27, 46, 0.85); backdrop-filter: blur(12px);
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
                .btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; box-shadow: none; }
                .hidden { display: none; }
                .spinner-wrapper {
                    position: relative; width: 65px; height: 65px;
                    margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;
                }
                .spinner {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    border: 4px solid #1e293b; border-top: 4px solid #00f3ff;
                    border-radius: 50%; animation: spin 1s linear infinite;
                }
                .timer-count { font-size: 22px; font-weight: 800; color: #00f3ff; z-index: 2; }
                .checkmark { display: none; font-size: 48px; color: #10b981; margin-bottom: 15px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .status { margin-top: 12px; color: #00f3ff; font-size: 13px; min-height: 18px; }
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
                    <div id="spinnerWrapper" class="spinner-wrapper">
                        <div class="spinner"></div>
                        <span id="timerCount" class="timer-count">5</span>
                    </div>
                    <div id="checkIcon" class="checkmark">✓</div>
                    <h2>REDIRECTING...</h2>
                    <p id="statusMsg" class="sub">PLEASE WAIT WHILE WE PREPARE YOUR LINK...</p>
                    <button id="redirectBtn" class="btn hidden" onclick="goShortlink()">CLICK IF NOT REDIRECTED</button>
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

                    let seconds = 5;
                    const timerCount = document.getElementById('timerCount');
                    const timer = setInterval(() => {
                        seconds--;
                        if (seconds >= 0) timerCount.innerText = seconds;
                        if (seconds < 0) {
                            clearInterval(timer);
                            document.getElementById('spinnerWrapper').style.display = 'none';
                            document.getElementById('checkIcon').style.display = 'block';
                            document.getElementById('redirectBtn').classList.remove('hidden');
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
// 2️⃣ STEP 2: GENERATE SHORTLINK & SET ENCRYPTED COOKIE
// ----------------------------------------------------------------------
app.get('/api/process-token', apiLimiter, async (req, res) => {
    const { token, cf_token } = req.query;

    if (!token || !cf_token) return res.json({ success: false, message: "Missing required parameters" });

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
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc) {
            return res.json({ success: false, message: "Invalid or non-existent token!" });
        }

        if (tokenDoc.is_used) {
            return res.json({ success: false, message: "This link/token has ALREADY BEEN USED!" });
        }

        const clientIp = getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'unknown';

        // 🛡️ Set Encrypted Cookie
        res.cookie('v_session', cleanToken, {
            httpOnly: true,
            signed: true,
            maxAge: 15 * 60 * 1000,
            sameSite: 'lax'
        });

        // Save generation time and fingerprint
        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { 
                $set: { 
                    generated_at: Date.now(),
                    created_ip: clientIp,
                    created_ua: userAgent
                } 
            }
        );

        const settings = await db.collection('settings').findOne({ _id: "bot_settings" });
        if (!settings || !settings.shortlink_url || !settings.shortlink_api) {
            return res.json({ success: false, message: "Shortener configuration missing." });
        }

        const hostUrl = req.protocol + '://' + req.get('host');
        const targetProxyUrl = `${hostUrl}/claim?token=${cleanToken}`;

        const shortenerApiUrl = `https://${settings.shortlink_url}/api?api=${settings.shortlink_api}&url=${encodeURIComponent(targetProxyUrl)}`;
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
// 3️⃣ STEP 3: CLAIM GATEKEEPER PAGE (/claim)
// ----------------------------------------------------------------------
app.get('/claim', apiLimiter, async (req, res) => {
    const { token } = req.query;

    if (!token) return res.status(400).send(renderAccessDeniedUI("🚫 Missing token parameter."));

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc) return res.status(404).send(renderAccessDeniedUI("⚡ Invalid or expired token."));
        
        // ❌ अगर क्लेम पेज पर पहले से यूज़ किया टोकन खुले
        if (tokenDoc.is_used) {
            return res.status(403).send(
                renderAccessDeniedUI("⚠️ LINK ALREADY CLAIMED! This token has already been redeemed in Telegram.", "Already Claimed")
            );
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Security Verification Gateway</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
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
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
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
                        <span id="scanCount" class="timer-count">5</span>
                    </div>
                    <h2>VERIFYING SECURITY...</h2>
                    <p class="sub">SCANNING FOR AUTOMATION & BYPASS BOTS...</p>
                </div>

                <div id="claimStep" class="hidden">
                    <h2 style="color:#10b981;">✓ VERIFICATION PASSED</h2>
                    <p class="sub">CLICK BELOW TO RETURN TO TELEGRAM BOT</p>
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

                function detectHeadlessBot() {
                    const isWebDriver = navigator.webdriver || false;
                    const isHeadlessUA = /HeadlessChrome|PhantomJS|Puppeteer/i.test(navigator.userAgent);
                    const isZeroWindow = (window.outerWidth === 0 && window.outerHeight === 0);
                    const missingLanguages = !navigator.languages || navigator.languages.length === 0;

                    return isWebDriver || isHeadlessUA || isZeroWindow || missingLanguages;
                }

                let scanSeconds = 5;
                const scanCount = document.getElementById('scanCount');
                
                const scanTimer = setInterval(() => {
                    scanSeconds--;
                    if (scanSeconds >= 0) scanCount.innerText = scanSeconds;

                    if (scanSeconds < 0) {
                        clearInterval(scanTimer);
                        verifyMinTimeGate();
                    }
                }, 1000);

                let finalBotUrl = "";

                async function verifyMinTimeGate() {
                    const isAutomatedBot = detectHeadlessBot();

                    try {
                        const res = await fetch(\`/api/execute-claim\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                token: "${cleanToken}",
                                isHeadlessBot: isAutomatedBot
                            })
                        });
                        const data = await res.json();

                        document.getElementById('checkStep').classList.add('hidden');

                        if (data.success && data.url) {
                            finalBotUrl = data.url;
                            document.getElementById('claimStep').classList.remove('hidden');
                        } else {
                            document.getElementById('deniedReason').innerText = data.message || "Bypass bot detected or link expired.";
                            document.getElementById('deniedStep').classList.remove('hidden');
                        }
                    } catch(e) {
                        document.getElementById('checkStep').classList.add('hidden');
                        document.getElementById('deniedReason').innerText = "Security Verification Failed.";
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
// 4️⃣ STEP 4: BACKEND GATE CHECK API (/api/execute-claim)
// ----------------------------------------------------------------------
app.post('/api/execute-claim', apiLimiter, async (req, res) => {
    const { token, isHeadlessBot } = req.body || {};

    if (!token) return res.json({ success: false, message: "Token parameter missing." });

    try {
        const cleanToken = token.trim();
        const clientIp = getClientIp(req);

        // 1. Check Token existence
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc) return res.json({ success: false, message: "Invalid or non-existent token." });
        
        // 2. Double-check used status
        if (tokenDoc.is_used) {
            return res.json({ success: false, message: "⚠️ LINK ALREADY USED! This token has already been claimed." });
        }

        // 3. Encrypted HttpOnly Cookie Check
        const sessionToken = req.signedCookies.v_session;
        if (!sessionToken || sessionToken !== cleanToken) {
            return res.json({ 
                success: false, 
                message: "BYPASS DETECTED: Missing Encrypted Browser Session Cookie! Script bypass blocked." 
            });
        }

        // 4. Headless Automation Check
        if (isHeadlessBot === true) {
            return res.json({ 
                success: false, 
                message: "BYPASS DETECTED: Automated Headless Browser / Script detected." 
            });
        }

        // 5. IP Mismatch Lock
        if (tokenDoc.created_ip && tokenDoc.created_ip !== clientIp) {
            return res.json({ 
                success: false, 
                message: "SECURITY ALERT: IP Mismatch! The IP address claiming this token does not match initial device." 
            });
        }

        // 6. Time Limit Gate Check (60 Seconds Minimum)
        const generatedAt = tokenDoc.generated_at || Date.now();
        const timeElapsedSeconds = Math.floor((Date.now() - generatedAt) / 1000);
        const MIN_REQUIRED_SECONDS = 60;

        if (timeElapsedSeconds < MIN_REQUIRED_SECONDS) {
            return res.json({ 
                success: false, 
                message: `BYPASS DETECTED! Completed in ${timeElapsedSeconds}s. Minimum required time is ${MIN_REQUIRED_SECONDS} seconds.` 
            });
        }

        // 7. Atomic DB Update (Mark as Used)
        const updateResult = await db.collection('verify_tokens').findOneAndUpdate(
            { token: cleanToken, is_used: false },
            { 
                $set: { 
                    is_used: true, 
                    claimed_at: Date.now(),
                    claimed_ip: clientIp 
                } 
            },
            { returnDocument: 'after' }
        );

        if (!updateResult) {
            return res.json({ success: false, message: "Token has already been processed or claimed." });
        }

        // Clear encrypted cookie
        res.clearCookie('v_session');

        // Fetch Bot Username
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

app.listen(PORT, () => console.log(`Proxy server listening on port ${PORT}`));
