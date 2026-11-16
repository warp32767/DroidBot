const { SlashCommandBuilder } = require(`discord.js`);
const { EmbedBuilder, ActivityType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require(`discord.js`);
const { simpleGit } = require(`simple-git`);
const path = require(`path`);
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const pm2Path = require.resolve('pm2/bin/pm2');
const fs = require(`fs`);
const logger = require(`../../handler/logger`);
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName(`debug`)
        .setDescription(`Debugger menu`)
        .addSubcommand(subcommand =>
            subcommand
                .setName(`update`)
                .setDescription(`Pull repository files and restart the bot`))
        .addSubcommand(subcommand =>
            subcommand
                .setName(`log`)
                .setDescription(`Show last 2000-ish chars of errors`))
        .addSubcommand(subcommand =>
            subcommand
                .setName(`public_ip`)
                .setDescription(`Get the machine's public IP`))
        .addSubcommand(subcommand =>
            subcommand
                .setName(`restart_bot`)
                .setDescription(`Restart the bot`))
        .addSubcommand(subcommand =>
            subcommand
                .setName(`change_status`)
                .setDescription(`Change the bot status`)
                .addStringOption(option =>
                    option.setName(`status`)
                        .setDescription(`Enter the new status`)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName(`activity_type`)
                        .setDescription(`Select the activity type`)
                        .setRequired(true)
                        .addChoices(
                            { name: `Playing`, value: `playing` },
                            { name: `Streaming`, value: `streaming` },
                            { name: `Listening`, value: `listening` },
                            { name: `Watching`, value: `watching` }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName(`install`)
                .setDescription(`Run npm install and report the result`)),
    // ... rest of the module.exports
    async execute(interaction) {
        const allowedUserIds = [`1145477822123626596`, `956594941147099138`];
        const notifyUserIds = [`1145477822123626596`, `956594941147099138`];

        if (!allowedUserIds.includes(interaction.user.id)) {
            await interaction.reply({ content: `You do not have permission to use this command.`, ephemeral: true });
            return;
        }

        const formatTimestamp = () => {
            const now = new Date();
            const hours = now.getUTCHours().toString().padStart(2, '0');
            const minutes = now.getUTCMinutes().toString().padStart(2, '0');
            const seconds = now.getUTCSeconds().toString().padStart(2, '0');
            return `[${hours}:${minutes}:${seconds} UTC]`;
        };

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === `update`) {
            await interaction.deferReply({ ephemeral: true });

            const options = [
                new StringSelectMenuOptionBuilder().setLabel(`Cancel`).setValue(`cancel_1`),
                new StringSelectMenuOptionBuilder().setLabel(`Confirm Update`).setValue(`confirm`),
            ];

            const dropdown = new StringSelectMenuBuilder()
                .setCustomId(`confirm_update`)
                .setPlaceholder(`Select an option`)
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(dropdown);

            const followUpMessage = await interaction.followUp({
                content: `Select an option to confirm the update and restart the bot.`,
                components: [row],
            });

            const filter = i => i.user.id === interaction.user.id;
            const collector = followUpMessage.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 30_000, max: 1 });

            collector.on(`collect`, async i => {
                try {
                    await i.deferUpdate();
                    if (i.values[0] === `confirm`) {
                        const rootDir = path.resolve(__dirname, `../../`);
                        const git = simpleGit(rootDir);

                        const pullResult = await git.pull(['--ff-only']);
                        if (pullResult.summary.changes === 0) {
                            await i.editReply({ content: `Repository is already up to date.`, components: [], ephemeral: true });
                        } else {
                            await i.editReply({ content: `Repository updated. Installing dependencies before restarting...`, components: [], ephemeral: true });

                            await run('npm', ['install'], { cwd: rootDir, timeout: 600_000 });
                            for (const userId of notifyUserIds) {
                                const user = await interaction.client.users.fetch(userId).catch(error => { logger.warning(error.message); return null; });
                                if (user) await user.send(`${formatTimestamp()} The bot has been updated and will restart shortly.`).catch(error => logger.warning(error.message));
                            }
                            await run(process.execPath, [pm2Path, 'restart', 'droidbot'], { cwd: rootDir, timeout: 30_000 });
                        }
                    } else {
                        await i.editReply({ content: `Update canceled.`, components: [], ephemeral: true });
                    }
                } catch (error) {
                    logger.error(`Update failed: ${error.message}`);
                    await i.editReply({ content: `Update failed: ${error.message.slice(0, 1500)}`, components: [] }).catch(replyError => logger.error(replyError.message));
                }
            });

            return;
        }

        if (subcommand === `log`) {
            await interaction.deferReply({ ephemeral: true });

            const logDir = path.resolve(__dirname, `../../logs`);
            const logFiles = fs.readdirSync(logDir).filter(file => file.endsWith(`.log`));

            if (logFiles.length === 0) {
                await interaction.followUp({ content: `No crash logs found.` });
                return;
            }

            const errorLogs = logFiles.filter(file => file.includes(`error`));
            if (errorLogs.length === 0) {
                await interaction.followUp({ content: `No error logs found.` });
                return;
            }

            const latestLogFile = errorLogs.sort((a, b) => fs.statSync(path.join(logDir, b)).mtime - fs.statSync(path.join(logDir, a)).mtime)[0];
            const logContent = fs.readFileSync(path.join(logDir, latestLogFile), `utf8`);

            const embed = new EmbedBuilder()
                .setTitle(`Latest Error Log`)
                .setDescription(`\`\`\`${logContent.slice(-2000)}\`\`\``)
                .setColor(0xFF0000);

            await interaction.followUp({ embeds: [embed] });
            return;
        }

        if (subcommand === `restart_bot`) {
            await interaction.reply({ content: `Restarting bot...`, ephemeral: true });

            /*for (const userId of notifyUserIds) {
                const user = await interaction.client.users.fetch(userId).catch(error => { logger.warning(error.message); return null; });
                await user.send(`${formatTimestamp()} The bot is being restarted.`);
            }*/

            await run(process.execPath, [pm2Path, 'restart', 'droidbot'], { cwd: path.resolve(__dirname, '../../'), timeout: 30_000 });
            return;
        }

        if (subcommand === `public_ip`) {
            await interaction.deferReply({ ephemeral: true });

            const https = require('https');

            const getPublicIp = () => {
                return new Promise((resolve, reject) => {
                    const request = https.get('https://api.ipify.org?format=json', (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed && parsed.ip) resolve(parsed.ip);
                                else reject(new Error('Unexpected response from IP service'));
                            } catch (err) {
                                reject(err);
                            }
                        });
                    }).on('error', reject);
                    request.setTimeout(15_000, () => request.destroy(new Error('IP service timed out')));
                });
            };

            try {
                const ip = await getPublicIp();
                await interaction.followUp({ content: `Public IP: ${ip}`, ephemeral: true });
            } catch (error) {
                await interaction.followUp({ content: `Failed to get public IP: ${error.message}`, ephemeral: true });
            }

            return;
        }

        if (subcommand === `change_status`) {
            const newStatus = interaction.options.getString(`status`);
            const activityType = interaction.options.getString(`activity_type`);

            let activityTypeEnum;
            switch (activityType) {
                case `playing`:
                    activityTypeEnum = ActivityType.Playing;
                    break;
                case `streaming`:
                    activityTypeEnum = ActivityType.Streaming;
                    break;
                case `listening`:
                    activityTypeEnum = ActivityType.Listening;
                    break;
                case `watching`:
                    activityTypeEnum = ActivityType.Watching;
                    break;
                default:
                    activityTypeEnum = ActivityType.Playing;
            }

            interaction.client.user.setActivity(newStatus, { type: activityTypeEnum });
            await interaction.reply({ content: `Status changed to: ${newStatus} (${activityType})`, ephemeral: true });
        }
        if (subcommand === `install`) {
            await interaction.deferReply({ ephemeral: true });

            const rootDir = path.resolve(__dirname, `../../`);

            try {
                await run('npm', ['install'], { cwd: rootDir, timeout: 600_000, maxBuffer: 1024 * 1024 });
                await interaction.editReply({ content: 'npm install completed successfully.' });
            } catch (error) {
                logger.error(`npm install failed: ${error.message}`);
                await interaction.editReply({ content: 'npm install failed. Check the server logs for details.' });
            }

            return;
        }

    }
};
