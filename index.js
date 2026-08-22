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

// 🛡️ BACKGROUND BOT DETECTION MIDDLEWARE (Bina User Disturb Kiye)
app.use(async (req, res, next) => {
    await connectDB();
    if (!db) {
        return res.status(500).send("Database Connection Error. Please refresh.");
    }

    const userAgent = req.headers['user-agent'] || '';

    // 1. Headless Chrome, Automation Tools & Scripts Block
    const isAutomatedBot = /headlesschrome|puppeteer|selenium|playwright|python-requests|axios|curl|wget/i.test(userAgent);

    // 2. Direct API Calls Block (Missing Standard Browser Headers)
    const isBrowserRequest = req.headers['accept-language'] && req.headers['sec-fetch-dest'];

    if (isAutomatedBot || (!isBrowserRequest && req.path !== '/ping' && req.path !== '/')) {
        return res.status(403).send("Access Denied: Automated bot activity detected.");
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
        <title>Access Denied</title>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>
            body { background-color: #07090e; color: #e6edf3; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
            .card { background: rgba(13, 17, 23, 0.85); border: 1px solid rgba(255, 0, 85, 0.3); border-radius: 16px; padding: 28px; text-align: center; max-width: 400px; }
            .title { font-size: 20px; color: #ff0055; margin-bottom: 8px; font-weight: bold; }
            .sub { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
            .btn { display: inline-block; padding: 12px 20px; border-radius: 8px; background: #ff0055; color: #fff; text-decoration: none; font-weight: bold; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="title">VERIFICATION FAILED</div>
            <div class="sub">${reasonText}</div>
            <a href="https://t.me/SmartfilestorebyAcbot" class="btn">GET NEW LINK</a>
        </div>
    </body>
    </html>
    `;
}

app.get('/access-denied', (req, res) => {
    const reason = req.query.reason || "Verification process failed.";
    res.send(renderAccessDeniedUI(reason));
});

// ----------------------------------------------------------------------
// 1️⃣ STEP 1: SILENT INITIAL VERIFICATION
// ----------------------------------------------------------------------
app.get('/verify', async (req, res) => {
    const { token } = req.query;

    if (!token) return res.status(400).send(renderAccessDeniedUI("🚫 Invalid Token."));

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken, is_used: false });

        if (!tokenDoc) return res.status(403).send(renderAccessDeniedUI("⚡ Link expired or already used."));

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verifying...</title>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            <style>
                body { background: #07090e; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .loader { font-size: 14px; color: #00f3ff; font-weight: bold; letter-spacing: 1px; }
            </style>
        </head>
        <body>
            <div class="loader">VERIFYING CONNECTION...</div>
            <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onSilentVerify" data-size="invisible"></div>

            <script>
                async function onSilentVerify(cfToken) {
                    try {
                        const res = await fetch(\`/api/process-token?token=${cleanToken}&cf_token=\${encodeURIComponent(cfToken)}\`);
                        const data = await res.json();
                        if(data.success && data.url) {
                            window.location.href = data.url;
                        } else {
                            window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Bot Check Failed")}\`;
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
        res.status(500).send("Server Error");
    }
});

// GENERATE SHORTLINK API
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
            return res.json({ success: false, message: "Silent Captcha verification failed!" });
        }

        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken, is_used: false });

        if (!tokenDoc) return res.json({ success: false, message: "Token expired!" });

        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { generated_at: Date.now(), is_completed: false, gate_passed: false } }
        );

        const settings = await db.collection('settings').findOne({ _id: "bot_settings" });
        if (!settings || !settings.shortlink_url || !settings.shortlink_api) {
            return res.json({ success: false, message: "Shortener config missing." });
        }

        const hostUrl = req.protocol + '://' + req.get('host');
        const targetProxyUrl = `${hostUrl}/gate?token=${cleanToken}`;

        const shortenerApiUrl = `https://${settings.shortlink_url}/api?api=${settings.shortlink_api}&url=${encodeURIComponent(targetProxyUrl)}`;
        const response = await axios.get(shortenerApiUrl);
        const shortUrl = response.data.shortenedUrl || response.data.url;

        if (shortUrl) {
            return res.json({ success: true, url: shortUrl });
        } else {
            return res.json({ success: false, message: "Shortener error." });
        }
    } catch (err) {
        return res.json({ success: false, message: "Server Error." });
    }
});

// ----------------------------------------------------------------------
// 2️⃣ STEP 2: SILENT ANTI-BYPASS GATE
// ----------------------------------------------------------------------
app.get('/gate', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send(renderAccessDeniedUI("🚫 Missing token."));

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) {
            return res.status(403).send(renderAccessDeniedUI("⚠️ Invalid or used token."));
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Redirecting...</title>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            <style>
                body { background: #07090e; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .loader { font-size: 14px; color: #00f3ff; font-weight: bold; letter-spacing: 1px; }
            </style>
        </head>
        <body>
            <div class="loader">SECURING ACCESS...</div>
            <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onGateVerified" data-size="invisible"></div>

            <script>
                async function onGateVerified(cfToken) {
                    try {
                        const res = await fetch(\`/api/pass-gate?token=${cleanToken}&cf_token=\${encodeURIComponent(cfToken)}\`);
                        const data = await res.json();
                        if (data.success) {
                            window.location.href = \`/claim?token=${cleanToken}&hash=\${data.hash}\`;
                        } else {
                            window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Security Check Failed")}\`;
                        }
                    } catch(e) {
                        window.location.href = "/access-denied?reason=Gate Error";
                    }
                }
            </script>
        </body>
        </html>
        `);
    } catch (err) {
        return res.status(500).send(renderAccessDeniedUI("Gate Error."));
    }
});

app.get('/api/pass-gate', async (req, res) => {
    const { token, cf_token } = req.query;
    if (!token || !cf_token) return res.json({ success: false, message: "Missing params" });

    try {
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const cfResponse = await axios.post(verifyUrl, new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: cf_token
        }));

        if (!cfResponse.data.success) {
            return res.json({ success: false, message: "Gate Captcha failed!" });
        }

        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) {
            return res.json({ success: false, message: "Invalid token." });
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
// 3️⃣ STEP 3: SILENT CLAIM & REDIRECT TO TELEGRAM (FIXED FOR IN-APP WEBVIEW)
// ----------------------------------------------------------------------
app.get('/claim', async (req, res) => {
    const { token, hash } = req.query;
    if (!token || !hash) return res.status(400).send(renderAccessDeniedUI("🚫 Direct access blocked."));

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) return res.status(403).send(renderAccessDeniedUI("⚠️ Invalid or used token."));

        const expectedHash = generateSecureHash(cleanToken, tokenDoc.gate_time);
        if (!tokenDoc.gate_passed || tokenDoc.gate_hash !== hash || hash !== expectedHash) {
            return res.status(403).send(renderAccessDeniedUI("🛡️ BYPASS DETECTED: Invalid Hash."));
        }

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Claiming...</title>
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            <style>
                body { background: #07090e; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .loader { font-size: 14px; color: #00f3ff; font-weight: bold; letter-spacing: 1px; }
            </style>
        </head>
        <body>
            <div class="loader">FINALIZING ACCESS...</div>
            <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onSilentClaim" data-size="invisible"></div>

            <script>
                async function onSilentClaim(cfToken) {
                    try {
                        const res = await fetch(\`/api/execute-claim?token=${cleanToken}&hash=${hash}&cf_token=\${encodeURIComponent(cfToken)}\`);
                        const data = await res.json();
                        if (data.success && data.url) {
                            // Fix for ERR_UNKNOWN_URL_SCHEME in Telegram In-App Browser
                            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink) {
                                window.Telegram.WebApp.openTelegramLink(data.web_url || data.url);
                            } else {
                                window.location.href = data.url;
                            }
                        } else {
                            window.location.href = \`/access-denied?reason=\${encodeURIComponent(data.message || "Claim Failed")}\`;
                        }
                    } catch(e) {
                        window.location.href = "/access-denied?reason=Network Error";
                    }
                }
            </script>
        </body>
        </html>
        `);
    } catch (err) {
        return res.status(500).send(renderAccessDeniedUI("Claim Error."));
    }
});

// FINAL BACKEND CLAIM EXECUTION (UPDATED REDIRECT URLS)
app.get('/api/execute-claim', async (req, res) => {
    const { token, hash, cf_token } = req.query;
    if (!token || !hash || !cf_token) return res.json({ success: false, message: "Missing params." });

    try {
        const cleanToken = token.trim();
        const tokenDoc = await db.collection('verify_tokens').findOne({ token: cleanToken });

        if (!tokenDoc || tokenDoc.is_used) {
            return res.json({ success: false, message: "Invalid token." });
        }

        if (REQUIRE_POSTBACK && !tokenDoc.is_completed) {
            return res.json({ success: false, message: "🚫 BYPASS DETECTED: Shortlink skipped!" });
        }

        const expectedHash = generateSecureHash(cleanToken, tokenDoc.gate_time);
        if (!tokenDoc.gate_passed || tokenDoc.gate_hash !== hash || hash !== expectedHash) {
            return res.json({ success: false, message: "BYPASS DETECTED! Hash Mismatch." });
        }

        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const cfResponse = await axios.post(verifyUrl, new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: cf_token
        }));

        if (!cfResponse.data.success) {
            return res.json({ success: false, message: "Captcha Verification Failed." });
        }

        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { is_used: true, claimed_at: Date.now() } }
        );

        const settings = await db.collection('settings').findOne({ _id: "bot_settings" });
        let rawBotUsername = (settings && settings.bot_username) || "SmartfilestorebyAcbot";
        const botUsername = rawBotUsername.replace(/^@/, '');

        // Standard Telegram Deep-Link Protocol
        const targetTelegramUrl = `tg://resolve?domain=${botUsername}&start=verify_${cleanToken}`;
        const webTelegramUrl = `https://t.me/${botUsername}?start=verify_${cleanToken}`;

        return res.json({ 
            success: true, 
            url: targetTelegramUrl,
            web_url: webTelegramUrl
        });

    } catch (err) {
        return res.json({ success: false, message: "Server execution error." });
    }
});

// POSTBACK RECEIVER (Webhook)
app.get('/api/postback', async (req, res) => {
    const { token, secret } = req.query;
    if (secret !== POSTBACK_SECRET) return res.status(401).send("Unauthorized");
    if (!token) return res.status(400).send("Missing token");

    try {
        const cleanToken = token.trim();
        await db.collection('verify_tokens').updateOne(
            { token: cleanToken },
            { $set: { is_completed: true, postback_at: Date.now() } }
        );
        return res.status(200).send("OK");
    } catch (err) {
        return res.status(500).send("Server Error");
    }
});

app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`));
