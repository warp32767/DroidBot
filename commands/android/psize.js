const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, EmbedBuilder } = require('discord.js');
const { search, generateSizeComparison } = require('./psizeSearch'); // your module

const optionNames = ['first_phone', 'second_phone', 'third_phone'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('psize')
        .setDescription('Gather and display in an image comparison the size of 1 to 3 phones!')
        .addStringOption(option => option.setName('first_phone').setRequired(true).setDescription('The first phone you are searching'))
        .addStringOption(option => option.setName('second_phone').setDescription('The second phone you are searching'))
        .addStringOption(option => option.setName('third_phone').setDescription('The third phone you are searching')),

    async execute(interaction) {
        await interaction.deferReply();

        const rows = [];
        const selectedPhones = [];
        const optionValues = optionNames.map(name => interaction.options.getString(name)).filter(Boolean);

        // Run searches in parallel
        const resultsList = await Promise.all(optionValues.map(optionValue => search(optionValue)));

        for (let i = 0; i < optionValues.length; i++) {
            const optionValue = optionValues[i];
            const results = resultsList[i];

            if (!results || results.length === 0) {
                return interaction.editReply(`Nothing found for \`${optionValue}\``);
            }

            // Only one result? Auto-select
            if (results.length === 1) {
                const splitVal = results[0].value.split('\0');
                selectedPhones[i] = {
                    name: results[0].label,
                    value: splitVal[0],
                    label: splitVal[1] || results[0].label
                };
                continue;
            }

            // Multiple results -> build dropdown
            const options = results.slice(0, 20).map(p =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(p.label)
                    .setValue(p.value)
            );

            const select = new StringSelectMenuBuilder()
                .setCustomId(`psize_${i}`)
                .setPlaceholder(`Select phone for: ${optionValue}`)
                .addOptions(...options);

            const row = new ActionRowBuilder().addComponents(select);
            rows.push(row);
        }

        // If all options auto-selected, skip dropdowns
        if (rows.length === 0) {
            try {
                const comp = await generateSizeComparison({ values: selectedPhones });
                const embed = new EmbedBuilder().setDescription(comp.description).setFooter({ text: 'Phone Arena' });
                return interaction.editReply({ embeds: [embed], files: [{ attachment: comp.image, name: 'image.png' }] });
            } catch {
                return interaction.editReply('One or more of the selected phone(s) could not be found.');
            }
        }

        // Send dropdowns
        const message = await interaction.editReply({ content: 'Choose your phone(s):', components: rows });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000,
        });

        collector.on('collect', async selectInteraction => {
            const idx = parseInt(selectInteraction.customId.split('_')[1]);
            const selectedValue = selectInteraction.values[0];

            const row = selectInteraction.message.components.find(r => r.components[0].customId === `psize_${idx}`);
            if (!row) return selectInteraction.update({ content: 'Dropdown not found.', components: [] });

            const option = row.components[0].options.find(o => o.value === selectedValue);
            if (!option) return selectInteraction.update({ content: 'The selected phone does not exist.', components: [] });

            const splitValue = option.value.split('\0');
            if (!splitValue[1]) return selectInteraction.update({ content: `The selected phone \`${option.label}\` does not exist.`, components: [] });

            selectedPhones[idx] = {
                name: option.label,
                value: splitValue[0],
                label: splitValue[1]
            };

            // Disable only this dropdown
            const newSelect = new StringSelectMenuBuilder()
                .setCustomId(row.components[0].customId)
                .setPlaceholder(row.components[0].placeholder)
                .setDisabled(true)
                .addOptions(option);

            const newRow = new ActionRowBuilder().addComponents(newSelect);
            const newComponents = selectInteraction.message.components.map(r =>
                r.components[0].customId === `psize_${idx}` ? newRow : r
            );

            await selectInteraction.update({ components: newComponents });

            // All selected? Show loading message
            if (selectedPhones.filter(Boolean).length === optionValues.length) {
                collector.stop('done');

                // Disable all dropdowns and indicate searching
                const loadingComponents = selectInteraction.message.components.map(r => {
                    const sel = r.components[0];
                    return new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(sel.customId)
                            .setPlaceholder('Generating comparison…')
                            .setDisabled(true)
                            .addOptions(sel.options)
                    );
                });
                await interaction.editReply({ components: loadingComponents });

                // Generate comparison
                try {
                    const comp = await generateSizeComparison({ values: selectedPhones });
                    const embed = new EmbedBuilder().setDescription(comp.description).setFooter({ text: 'Phone Arena' });

                    await interaction.editReply({
                        content: '**Size comparison**',
                        embeds: [embed],
                        files: [{ attachment: comp.image, name: 'image.png' }],
                        components: []
                    });
                } catch {
                    await interaction.editReply('One or more of the selected phone(s) could not be found.');
                }
            }
        });

        collector.on('end', (_, reason) => {
            if (reason !== 'done') {
                interaction.editReply({ content: 'Selection timed out.', components: [] });
            }
        });
    }
};
