const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

const cargosAdvCommand = new SlashCommandBuilder()
    .setName('cargos-adv')
    .setDescription('Painel exclusivo para configurar os cargos automáticos de advertência')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function handleCargosAdvInteraction(interaction) {
    const isCommand = interaction.isChatInputCommand() && interaction.commandName === 'cargos-adv';
    const isButton = interaction.isButton() && interaction.customId.startsWith('adv_cfg_');
    const isModal = interaction.isModalSubmit() && interaction.customId.startsWith('adv_modal_');

    if (!isCommand && !isButton && !isModal) return false;

    try {
        const guildId = interaction.guild.id;

        if (isCommand) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true }).catch(() => {});
            }
            await enviarPainelCargos(interaction, false);
            return true;
        }

        if (isButton) {
            const tipoMap = {
                'adv_cfg_1': 'ADV 1',
                'adv_cfg_2': 'ADV 2',
                'adv_cfg_3': 'ADV 3',
                'adv_cfg_ban': 'Banimento'
            };
            const tipoSelecionado = tipoMap[interaction.customId];

            const modal = new ModalBuilder()
                .setCustomId(`adv_modal_${tipoSelecionado}`)
                .setTitle(`Configurar Cargo: ${tipoSelecionado}`);

            const inputIdCargo = new TextInputBuilder()
                .setCustomId('id_cargo_input')
                .setLabel(`Cole o ID do cargo para ${tipoSelecionado}`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 123456789012345678')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputIdCargo));
            await interaction.showModal(modal);
            return true;
        }

        if (isModal) {
            const tipo = interaction.customId.replace('adv_modal_', '');
            const idCargo = interaction.fields.getTextInputValue('id_cargo_input').trim();

            await db.set(`cargo_punicao_${guildId}_${tipo}`, idCargo);

            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({ 
                    content: `✅ Cargo para **${tipo}** configurado com sucesso! ID salvo: \`${idCargo}\``, 
                    ephemeral: true 
                }).catch(() => {});
            }
            return true;
        }

    } catch (err) {
        console.error("Erro no gerenciamento de cargos adv:", err);
    }
    return true;
}

async function enviarPainelCargos(interaction, isUpdate = false) {
    const guildId = interaction.guild.id;

    const adv1 = await db.get(`cargo_punicao_${guildId}_ADV 1`) || 'Não configurado';
    const adv2 = await db.get(`cargo_punicao_${guildId}_ADV 2`) || 'Não configurado';
    const adv3 = await db.get(`cargo_punicao_${guildId}_ADV 3`) || 'Não configurado';
    const ban = await db.get(`cargo_punicao_${guildId}_Banimento`) || 'Não configurado';

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🛡️ Gerenciamento de Cargos Automáticos (ADV)')
        .setDescription('Clique nos botões abaixo para definir ou alterar qual cargo o bot deve aplicar automaticamente em cada tipo de punição.')
        .addFields(
            { name: '📌 ADV 1', value: `Cargo ID: \`${adv1}\``, inline: true },
            { name: '📌 ADV 2', value: `Cargo ID: \`${adv2}\``, inline: true },
            { name: '📌 ADV 3', value: `Cargo ID: \`${adv3}\``, inline: true },
            { name: '🔨 Banimento', value: `Cargo ID: \`${ban}\``, inline: true }
        );

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adv_cfg_1').setLabel('Configurar ADV 1').setStyle(ButtonStyle.Secondary).setEmoji('1️⃣'),
        new ButtonBuilder().setCustomId('adv_cfg_2').setLabel('Configurar ADV 2').setStyle(ButtonStyle.Secondary).setEmoji('2️⃣'),
        new ButtonBuilder().setCustomId('adv_cfg_3').setLabel('Configurar ADV 3').setStyle(ButtonStyle.Secondary).setEmoji('3️⃣')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adv_cfg_ban').setLabel('Configurar Banimento').setStyle(ButtonStyle.Danger).setEmoji('🔨')
    );

    const payload = {
        embeds: [embed],
        components: [row1, row2],
        ephemeral: true
    };

    if (isUpdate && interaction.isRepliable()) {
        await interaction.update(payload).catch(() => {});
    } else if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
    } else {
        await interaction.reply(payload).catch(() => {});
    }
}

module.exports = { cargosAdvCommand, handleCargosAdvInteraction };