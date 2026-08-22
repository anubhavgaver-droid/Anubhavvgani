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

// Access Denied Render Endpoint
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
            <title>Secure Verification</title>
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
                }
                h2 { font-size: 20px; margin-bottom: 8px; color: #fff; }
                p.sub { color: #8b949e; font-size: 12px; margin-bottom: 18px; }
                .turnstile-container { display: flex; justify-content: center; margin-bottom: 18px; }
                .btn {
                    background: linear-gradient(135deg, #00f3ff 0%, #00a6ff 100%);
                    color: #000; border: none; padding: 14px 28px; font-size: 15px; font-weight: bold;
                    border-radius: 8px; cursor: pointer; width: 100%;
                }
                .btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; }
                .loader-box { display: none; margin-top: 15px; }
                .progress-bar {
                    width: 100%; height: 8px; background: rgba(255,255,255,0.1);
                    border-radius: 4px; overflow: hidden; margin-top: 12px;
                }
                .fill { width: 0%; height: 100%; background: #00f3ff; transition: width 0.15s linear; }
                .status-text { font-size: 12px; color: #00f3ff; font-weight: bold; letter-spacing: 1px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>SECURE VERIFICATION</h2>
                <p class="sub">PLEASE COMPLETE THIS CHECK 🎴</p>

                <div id="verify-form">
                    <div class="turnstile-container">
                        <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onCaptchaSuccess"></div>
                    </div>
                    <button id="vBtn" class="btn" onclick="processVerify()" disabled>VERIFY & CONTINUE</button>
                </div>

                <div id="loader" class="loader-box">
                    <div class="status-text" id="statusText">INITIALIZING...</div>
                    <div class="progress-bar"><div id="progress" class="fill"></div></div>
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
                }

                async function processVerify() {
                    document.getElementById('verify-form').style.display = 'none';
                    document.getElementById('loader').style.display = 'block';

                    let percent = 0;
                    const pBar = document.getElementById('progress');
                    const sText = document.getElementById('statusText');

                    const interval = setInterval(() => {
                        percent += 10;
                        pBar.style.width = percent + '%';
                        if (percent >= 50 && percent < 90) {
                            sText.innerText = "REDIRECTING...";
                        }
                        if (percent >= 100) {
                            clearInterval(interval);
                        }
                    }, 100);

                    try {
                        const res = await fetch(\`/api/process-token?token=${cleanToken}&cf_token=\${encodeURIComponent(turnstileResponseToken)}\`);
                        const data = await res.json();
                        
                        setTimeout(() => {
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
                        }, 1200);

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
// 3️⃣ STEP 3: ADVANCED DYNAMIC GATE (MATCHING VIDEO ANIMATION)
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
            <title>Verification Gateway</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background: #000; color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex; justify-content: center; align-items: center;
                    min-height: 100vh; overflow: hidden;
                }
                .card {
                    background: #0d1117; border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px; padding: 24px 20px; text-align: center;
                    width: 90%; max-width: 360px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
                }
                .icon-shield {
                    width: 36px; height: 36px; border-radius: 10px;
                    background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255,255,255,0.1);
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 16px auto; font-size: 16px;
                }
                .badge-blue {
                    display: inline-block; background: rgba(0, 119, 255, 0.15);
                    border: 1px solid #0077ff; color: #3898ff;
                    font-size: 9px; font-weight: 800; letter-spacing: 1px;
                    padding: 4px 10px; border-radius: 12px; margin-bottom: 12px;
                }
                .badge-payload {
                    display: inline-block; background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2); color: #ccc;
                    font-size: 9px; font-weight: 800; letter-spacing: 1px;
                    padding: 4px 10px; border-radius: 12px; margin-bottom: 12px;
                }
                h2 { font-size: 18px; color: #fff; margin-bottom: 6px; font-weight: 600; }
                p.sub { color: #8b949e; font-size: 12px; margin-bottom: 20px; }
                .btn-verify {
                    background: #ffffff; color: #000; border: none;
                    padding: 14px 20px; font-size: 14px; font-weight: 600;
                    border-radius: 12px; cursor: pointer; width: 100%; transition: 0.2s;
                }
                .btn-verify:hover { background: #e6e6e6; }
                .dest-box {
                    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 12px; padding: 12px; margin-bottom: 15px; display: flex;
                    align-items: center; justify-content: space-between;
                }
                .timer-num { font-size: 22px; font-weight: bold; color: #fff; }
                .dest-url { font-size: 13px; color: #e6edf3; font-weight: 500; }
                .cf-box { display: flex; justify-content: center; margin-top: 10px; }
                .modal-overlay {
                    display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
                    justify-content: center; align-items: center; z-index: 10;
                }
                .modal-card {
                    background: #161b22; border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 16px; padding: 25px; text-align: center; width: 80%; max-width: 300px;
                }
                .check-circle {
                    width: 40px; height: 40px; border-radius: 50%;
                    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 12px auto; font-size: 18px; color: #fff;
                }
            </style>
        </head>
        <body>

            <!-- PHASE 1: ACTION REQUIRED PAGE -->
            <div class="card" id="phase1">
                <div class="icon-shield">🛡️</div>
                <div class="badge-blue">● ACTION REQUIRED</div>
                <h2>Verify Connection</h2>
                <p class="sub">Please click below to securely verify your access token.</p>
                <button class="btn-verify" onclick="startVerification()">Verify Now</button>
            </div>

            <!-- PHASE 2: PAYLOAD & TURNSTILE CHECK PAGE -->
            <div class="card" id="phase2" style="display: none;">
                <div class="icon-shield">🛡️</div>
                <div class="badge-payload">● PAYLOAD VERIFIED</div>
                <h2>Access Granted</h2>
                <p class="sub">Your request has been verified and is being routed securely.</p>

                <div class="dest-box">
                    <span class="timer-num" id="timer">3</span>
                    <div>
                        <div style="font-size:10px; color:#8b949e; text-align:right;">Destination</div>
                        <div class="dest-url">get2short.com</div>
                    </div>
                </div>

                <div class="cf-box">
                    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onGateVerified"></div>
                </div>
            </div>

            <!-- PHASE 3: VERIFICATION COMPLETE MODAL -->
            <div class="modal-overlay" id="phase3">
                <div class="modal-card">
                    <div class="check-circle">✓</div>
                    <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 4px;">Verification Complete</h3>
                    <p style="font-size: 11px; color: #8b949e;">Routing to destination...</p>
                </div>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                let count = 3;
                let captchaToken = null;
                let countdownInterval = null;

                function startVerification() {
                    document.getElementById('phase1').style.display = 'none';
                    document.getElementById('phase2').style.display = 'block';

                    countdownInterval = setInterval(() => {
                        count--;
                        if(count > 0) {
                            document.getElementById('timer').innerText = count;
                        } else {
                            clearInterval(countdownInterval);
                            document.getElementById('timer').innerText = "✓";
                            checkAndRedirect();
                        }
                    }, 1000);
                }

                function onGateVerified(token) {
                    captchaToken = token;
                    checkAndRedirect();
                }

                async function checkAndRedirect() {
                    if (count <= 0 && captchaToken) {
                        try {
                            const res = await fetch(\`/api/pass-gate?token=${cleanToken}&cf_token=\${encodeURIComponent(captchaToken)}\`);
                            const data = await res.json();
                            if (data.success) {
                                document.getElementById('phase3').style.display = 'flex';
                                setTimeout(() => {
                                    window.location.href = \`/claim?token=${cleanToken}&hash=\${data.hash}\`;
                                }, 1200);
                            } else {
                                window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Security Check Failed")}\`;
                            }
                        } catch(e) {
                            window.location.href = "/access-denied?reason=Gate Connection Error";
                        }
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
    const { token, cf_token } = req.query;
    if (!token || !cf_token) return res.json({ success: false, message: "Missing token or captcha parameters." });

    try {
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const cfResponse = await axios.post(verifyUrl, new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: cf_token
        }));

        if (!cfResponse.data.success) {
            return res.json({ success: false, message: "Gate Captcha verification failed!" });
        }

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
// 4️⃣ STEP 4: CLAIM PAGE
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
            <title>Claim Gateway</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background: #0b0f19; color: white;
                    font-family: 'Segoe UI', -apple-system, sans-serif;
                    display: flex; justify-content: center; align-items: center;
                    min-height: 100vh;
                }
                .card {
                    background: rgba(19, 27, 46, 0.85);
                    border: 1px solid rgba(0, 243, 255, 0.3); border-radius: 16px;
                    padding: 28px 20px; text-align: center; width: 90%; max-width: 380px;
                }
                .btn {
                    background: linear-gradient(135deg, #00f3ff 0%, #00a6ff 100%);
                    color: #000; border: none; padding: 14px 28px; font-size: 15px; font-weight: bold;
                    border-radius: 8px; cursor: pointer; width: 100%; margin-top: 15px;
                }
                .btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>VERIFY TASK</h2>
                <div style="display:flex; justify-content:center; margin-top:15px;">
                    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onClaimCaptcha"></div>
                </div>
                <button id="claimBtn" class="btn" onclick="executeClaim()" disabled>🎁 CLAIM YOUR TOKEN</button>
            </div>

            <script>
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                let claimCaptchaToken = "";
                function onClaimCaptcha(token) {
                    claimCaptchaToken = token;
                    document.getElementById('claimBtn').disabled = false;
                }

                async function executeClaim() {
                    const btn = document.getElementById('claimBtn');
                    btn.disabled = true;
                    btn.innerText = "VERIFYING...";

                    try {
                        const res = await fetch(\`/api/execute-claim?token=${cleanToken}&hash=${hash}&cf_token=\${encodeURIComponent(claimCaptchaToken)}\`);
                        const data = await res.json();

                        if (data.success && data.url) {
                            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                                window.Telegram.WebApp.openLink(data.url);
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
