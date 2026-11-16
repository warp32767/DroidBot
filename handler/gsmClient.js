const axios = require('axios');
const path = require('path');
const { mkdir } = require('node:fs/promises');
const { launchBrowser } = require('./gsmBrowser');
const { setTimeout: delay } = require('node:timers/promises');

const ORIGIN = 'https://www.gsmarena.com';
const PAGE_SELECTOR = '#review-body .makers, h1.specs-phone-name-title';

async function waitForDeviceContent(page, timeout) {
    const controller = new AbortController();
    let checkboxError;
    const checkboxTimeout = Math.max(1_000, timeout - 3_000);
    // A frame and its spinner can exist well before the checkbox is ready.
    const checkboxAttempt = (async () => {
        const frame = await page.waitForFrame(frame => frame.url().startsWith('https://challenges.cloudflare.com/'), {
            timeout: checkboxTimeout, signal: controller.signal,
        });
        await frame.locator('::-p-aria([role="checkbox"])').setTimeout(checkboxTimeout).click({ signal: controller.signal });
    })().catch(error => {
        if (!controller.signal.aborted) checkboxError = error;
    });
    try {
        // Automatic verification can navigate directly to content without ever
        // exposing a checkbox. That is also a successful outcome.
        await page.waitForSelector(PAGE_SELECTOR, { timeout });
    } catch (error) {
        const title = await page.title().catch(() => 'unknown');
        throw new Error(`Device content did not appear within ${timeout / 1000}s; page title: ${JSON.stringify(title)}.${checkboxError ? ` Checkbox interaction: ${checkboxError.message}` : ''}`, { cause: error });
    } finally {
        controller.abort();
        await checkboxAttempt;
    }
}

function createGsmClient({
    http = axios,
    launch = launchBrowser,
    pause = delay,
    now = Date.now,
    headless = process.env.GSM_BROWSER_HEADLESS !== 'false',
    profileDir = process.env.GSM_BROWSER_PROFILE_DIR || path.resolve(__dirname, '../.cache/gsm-browser'),
} = {}) {
    let session;
    let refreshPromise;
    let retryAfter = 0;

    function cookieHeader(url) {
        return (session?.cookies || []).filter(cookie => {
            const domain = cookie.domain.replace(/^\./, '');
            const domainMatches = cookie.domain.startsWith('.')
                ? url.hostname === domain || url.hostname.endsWith(`.${domain}`)
                : url.hostname === domain;
            const path = cookie.path || '/';
            return domainMatches && (!cookie.secure || url.protocol === 'https:') &&
                (cookie.expires <= 0 || cookie.expires * 1000 > now()) &&
                (url.pathname === path || (url.pathname.startsWith(path) &&
                    (path.endsWith('/') || url.pathname[path.length] === '/')));
        }).map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    }

    async function refresh(url) {
        if (refreshPromise) return refreshPromise;
        refreshPromise = (async () => {
            let browser;
            let page;
            let stage = 'launching Chrome';
            try {
                browser = await launch({
                    headless, userDataDir: profileDir,
                    ignoreDefaultArgs: ['--enable-automation'],
                    args: ['--disable-blink-features=AutomationControlled'],
                    timeout: 30_000, protocolTimeout: 30_000,
                });
                stage = 'opening a browser page';
                page = await browser.newPage();
                await page.setUserAgent({ userAgent: (await browser.userAgent()).replace('HeadlessChrome/', 'Chrome/') });
                await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
                stage = 'navigating to GSMArena';
                const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                stage = `waiting for device content (HTTP ${response?.status() ?? 'unknown'})`;
                // Wait for actual content, rather than caching a challenge page as an empty result.
                // Visible mode allows an operator to complete an interactive check locally.
                await waitForDeviceContent(page, headless ? 30_000 : 120_000);
                stage = 'reading browser session cookies';
                const cookies = await browser.defaultBrowserContext().cookies();
                const userAgent = await page.evaluate(() => navigator.userAgent);
                // GSMArena verifies its own Turnstile form, so its session cookie need
                // not be cf_clearance. Respect the earliest relevant cookie expiry.
                const expirations = cookies.filter(cookie => {
                    const domain = cookie.domain.replace(/^\./, '');
                    return (url.hostname === domain || (cookie.domain.startsWith('.') && url.hostname.endsWith(`.${domain}`))) &&
                        cookie.expires * 1000 > now();
                }).map(cookie => cookie.expires * 1000 - 30_000);
                session = {
                    cookies,
                    userAgent,
                    expires: Math.min(now() + 15 * 60_000, ...expirations),
                };
                return session;
            } catch (error) {
                if (page && stage.startsWith('waiting for device content')) {
                    const screenshotPath = path.resolve(__dirname, '../logs/gsm-turnstile-failure.png');
                    try {
                        await mkdir(path.dirname(screenshotPath), { recursive: true });
                        await page.screenshot({ path: screenshotPath, timeout: 5_000 });
                        error.message += ` Screenshot saved to ${screenshotPath}.`;
                    } catch (screenshotError) {
                        error.message += ` Screenshot capture failed: ${screenshotError.message}.`;
                    }
                }
                const failure = new Error(`GSMArena browser session failed while ${stage}: ${error.message}`, { cause: error });
                // Installation, shared-library, sandbox, and profile-lock errors
                // will not improve by launching the same configuration again.
                failure.retryable = stage !== 'launching Chrome';
                throw failure;
            } finally {
                if (browser) await browser.close().catch(() => {});
            }
        })();
        try {
            return await refreshPromise;
        } finally {
            refreshPromise = undefined;
        }
    }

    async function request(url) {
        return http.get(url.href, {
            timeout: 15_000,
            maxRedirects: 0,
            responseType: 'text',
            validateStatus: () => true,
            headers: {
                'User-Agent': session?.userAgent || 'DroidBot/2.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml',
                'Accept-Language': 'en-US,en;q=0.9',
                ...(session ? { Cookie: cookieHeader(url) } : {}),
            },
        });
    }

    function challenged(response) {
        return response.headers?.['cf-mitigated'] === 'challenge' ||
            [403, 503].includes(response.status) ||
            /<title>[^<]*(?:Just a moment|Attention Required|Turnstile)|id=["']challenge-form["']|\/cdn-cgi\/challenge-platform\//i.test(response.data);
    }

    return {
        async getHtml(input) {
            const url = new URL(input);
            if (url.origin !== ORIGIN) throw new Error('Unsupported GSMArena URL');
            if (now() < retryAfter) throw new Error('GSMArena is temporarily unavailable after repeated session failures.');
            // Share in-flight renewal. A failed renewal can be retried below.
            if (refreshPromise) await refreshPromise.catch(() => {});
            let observedSession = session;
            let needsRefresh = !!session && session.expires <= now();
            let lastError;
            for (let attempt = 0; attempt <= 2; attempt++) {
                if (needsRefresh) {
                    try {
                        // Another caller may already have replaced the rejected session.
                        if (refreshPromise) await refreshPromise;
                        else if (session === observedSession) await refresh(url);
                    } catch (error) {
                        lastError = error;
                        if (error.retryable === false) break;
                        if (attempt < 2) { await pause(1000); continue; }
                        break;
                    }
                }
                observedSession = session;
                const response = await request(url);
                if (challenged(response)) {
                    lastError = new Error('GSMArena rejected the refreshed Axios session.');
                    needsRefresh = true;
                    continue;
                }
                if (response.status < 200 || response.status >= 300) throw new Error(`GSMArena returned HTTP ${response.status}`);
                retryAfter = 0;
                return response.data;
            }
            retryAfter = now() + 60_000;
            throw lastError;
        },
    };
}

module.exports = { ...createGsmClient(), createGsmClient, waitForDeviceContent };
