function loadEvents(client)
{
    const fs = require('node:fs');
    const path = require('node:path');
    const eventsPath = path.join(__dirname, '../events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        const listener = (...args) => {
            Promise.resolve().then(() => event.execute(...args)).catch(error => {
                require('./logger').error(`Event ${event.name} failed: ${error.stack || error.message}`);
            });
        };
        if (event.once) {
            client.once(event.name, listener);
        } else {
            client.on(event.name, listener);
        }
    }
}

module.exports = {
    loadEvents,
};