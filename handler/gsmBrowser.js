async function launchBrowser(options) {
    const { launch } = await import('puppeteer');
    return launch({
        ...options,
        args: [...(options.args || []), ...(process.platform === 'linux' ? ['--disable-dev-shm-usage'] : [])],
    });
}

module.exports = { launchBrowser };
