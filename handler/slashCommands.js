```javascript
function loadCommands(client)
{
    const path = require('node:path');
    const { getCommands } = require('../utils/getCommands');
    
    const commandsPath = path.join(__dirname, '../commands');
    const commands = getCommands(commandsPath);

    for (const command of commands) {
        client.commands.set(command.data.name, command);
    }
}

module.exports = {
    loadCommands,
};
```