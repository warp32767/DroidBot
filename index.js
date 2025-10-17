const { REST } = require("@discordjs/rest");
const { Client, Collection, GatewayIntentBits, EmbedBuilder, ActivityType, AttachmentBuilder } = require("discord.js");
const axios = require('axios');
const fs = require('node:fs');
const { loadEvents } = require("./handler/events");
const { token } = require('./config.json');
const { version } = require('./package.json');
const { loadCommands } = require("./handler/slashCommands");
const { deployCommands } = require("./handler/deployCommands");

const client = new Client({ intents: 46791 });
client.commands = new Collection();

const rest = new REST({ version: "10" }).setToken(token);

// load commands
loadCommands(client);
loadEvents(client);

// Logging
const logger = require("./handler/logger")

// check for updates on startup
async function checkForUpdates(){
    const commitJson = await axios.get(
        'https://api.github.com/repos/warp32767/DroidBot/commits/master',
    );
    const commitData = commitJson.data;
    const commit = commitData.sha;
    return commit.slice(0, 7);
}


async function setupEmbed() {
    const remoteCommit = await checkForUpdates();

    let localCommit = await fs.readFileSync('.git/refs/heads/master', 'utf8');

    icon = new AttachmentBuilder(`./images/droid.png`);
    const embed = new EmbedBuilder()
        .setTitle(`DroidBot \`${version}\``)
        .setColor('#ff0000')
        .setThumbnail(`attachment://droid.png`)
        .setFooter({ text: `By warp32767` });

    if (remoteCommit == localCommit.slice(0,7)) {
        embed.setDescription(`Hello droiders!\n\n**DroidBot is up to date!**\nLocal Version: \`${localCommit.slice(0,7)}\`\nLatest Version: \`${remoteCommit}\``);
    } else {
        embed.setDescription(`Hello droiders!\n\n**Please Update to Latest Version**\nLocal Version: \`${localCommit.slice(0,7)}\`\nLatest Version: \`${remoteCommit}\``);
    }

    const channelId = '620122073074892811';

    const channel = client.channels.cache.get(channelId);
    if (channel) {
        channel.send({ embeds: [embed], files: [icon] });
    } else {
        logger.error(`Could not find the specified channel: ${channelId}`);
    }
}


let guildIds = [];

client.on("ready", async () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('on the droid', { type: ActivityType.Playing });

    await setupEmbed();

    guildIds = await client.guilds.cache.map(guild => guild.id);
    logger.info(`Connected to guilds: ${guildIds}`)

    await deployCommands(client, guildIds);

});

// He sees everything
client.login(token);

module.exports = { guildIds, client };