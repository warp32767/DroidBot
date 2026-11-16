const { spawnSync } = require('node:child_process');
const path = require('node:path');

function ensureDependencies({
    cwd = path.resolve(__dirname, '..'),
    run = spawnSync,
    log = message => console.log(message),
} = {}) {
    // Built-ins only: this must run before loading any third-party modules.
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const options = { cwd, windowsHide: true, shell: process.platform === 'win32' };
    function check() {
        const result = run(npm, ['ls', '--all', '--omit=dev', '--json'], {
            ...options, stdio: 'ignore', timeout: 60_000,
        });
        if (result.error) throw new Error(`Cannot check npm dependencies: ${result.error.message}`, { cause: result.error });
        return result.status === 0;
    }

    if (check()) return false;
    log('Dependencies are missing or do not match package.json; running npm install.');
    const installed = run(npm, ['install', '--no-audit', '--no-fund'], {
        ...options, stdio: 'inherit', timeout: 600_000,
    });
    if (installed.error || installed.status !== 0) {
        throw new Error('npm install failed; bot startup stopped.', { cause: installed.error });
    }
    if (!check()) throw new Error('npm dependencies are still invalid after installation; bot startup stopped.');
    log('Dependencies are ready.');
    return true;
}

module.exports = { ensureDependencies };
