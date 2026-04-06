const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wordlist')
        .setDescription('Manage the blocklist')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)  // Only admins can see/use this command
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a phrase to the blocklist')
                .addStringOption(option =>
                    option.setName('phrase')
                        .setDescription('The phrase to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a phrase from the blocklist')
                .addStringOption(option =>
                    option.setName('phrase')
                        .setDescription('The phrase to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all phrases in the blocklist')),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const blocklistPath = path.resolve(__dirname, '../../events/helper/blocklist.json');

        try {
            const blocklistData = fs.readFileSync(blocklistPath, 'utf8');
            let blocklist = JSON.parse(blocklistData);

            if (subcommand === 'add') {
                const phrase = interaction.options.getString('phrase').trim();
                if (blocklist.includes(phrase)) {
                    await interaction.reply({ content: `Phrase "${phrase}" is already in the blocklist.`, ephemeral: true });
                    return;
                }
                blocklist.push(phrase);
                fs.writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
                await interaction.reply({ content: `Added "${phrase}" to the blocklist.`, ephemeral: true });

            } else if (subcommand === 'remove') {
                const phrase = interaction.options.getString('phrase').trim();
                const index = blocklist.indexOf(phrase);
                if (index === -1) {
                    await interaction.reply({ content: `Phrase "${phrase}" not found in the blocklist.`, ephemeral: true });
                    return;
                }
                blocklist.splice(index, 1);
                fs.writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
                await interaction.reply({ content: `Removed "${phrase}" from the blocklist.`, ephemeral: true });

            } else if (subcommand === 'list') {
                if (blocklist.length === 0) {
                    await interaction.reply({ content: 'The blocklist is empty.', ephemeral: true });
                    return;
                }
                const embed = new EmbedBuilder()
                    .setTitle('Blocklist Phrases')
                    .setDescription(blocklist.map((phrase, index) => `${index + 1}. ${phrase}`).join('\n'))
                    .setColor(0x0099ff);
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error managing blocklist:', error);
            await interaction.reply({ content: 'An error occurred while managing the blocklist.', ephemeral: true });
        }
    }
};
