const { access } = require('node:fs/promises');
const { constants } = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

function createBrowserInstaller({
    load = () => import('puppeteer'),
    check = file => access(file, constants.X_OK),
    run = promisify(execFile),
    cli = path.join(path.dirname(require.resolve('puppeteer/package.json')), 'lib/puppeteer/node/cli.js'),
    log = message => console.log(message),
} = {}) {
    let pending;
    return function ensureBrowser() {
        if (pending) return pending;
        pending = (async () => {
            const { default: puppeteer } = await load();
            const executablePath = await puppeteer.executablePath();
            try {
                await check(executablePath);
            } catch (error) {
                if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
                const config = await puppeteer.configuration();
                if (config.executablePath) throw new Error(`Configured Chrome executable is missing: ${executablePath}`);
                log('GSMArena: Chrome is missing; downloading Puppeteer’s matching Chrome build.');
                // Use the installed package's pinned version, never npx/latest or a shell.
                await run(process.execPath, [cli, 'browsers', 'install', 'chrome'], {
                    timeout: 300_000, maxBuffer: 1024 * 1024, windowsHide: true,
                });
                await check(executablePath);
                log('GSMArena: Chrome installation complete.');
            }
            return executablePath;
        })().finally(() => { pending = undefined; });
        return pending;
    };
}

const ensureBrowser = createBrowserInstaller();

async function launchBrowser(options) {
    const executablePath = await ensureBrowser();
    const { launch } = await import('puppeteer');
    return launch({
        ...options, executablePath,
        args: [...(options.args || []), ...(process.platform === 'linux' ? ['--disable-dev-shm-usage'] : [])],
    });
}

module.exports = { ensureBrowser, launchBrowser, createBrowserInstaller };
