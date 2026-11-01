const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder,
    RoleSelectMenuBuilder,
    PermissionsBitField 
} = require('discord.js');

const verificacaoCommand = new SlashCommandBuilder()
    .setName('verificacao')
    .setDescription('Envia o painel de verificação no canal atual (Admin)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

async function handleVerificacaoInteraction(interaction, db) {
    const isCommand = interaction.isChatInputCommand() && interaction.commandName === 'verificacao';
    const isButton = interaction.isButton() && (
        interaction.customId === 'btn_verificar_membro' || 
        interaction.customId === 'config_verificacao'
    );
    const isRoleSelect = interaction.isRoleSelectMenu() && interaction.customId === 'select_cargo_verificado';

    if (!isCommand && !isButton && !isRoleSelect) return false;

    try {
        const guildId = interaction.guild.id;

        // 1. Comando Slash /verificacao
        if (isCommand) {
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            const isOwner = interaction.guild.ownerId === interaction.user.id;
            if (!isAdmin && !isOwner) {
                await interaction.reply({ content: '❌ Não tens permissão para usar este comando.', ephemeral: true });
                return true;
            }

            const doc = await db.collection('dados').findOne({ _id: `cargo_verificado_${guildId}` });
            const cargoVerificadoId = doc ? doc.value : null;

            if (!cargoVerificadoId) {
                await interaction.reply({ content: '❌ Configura primeiro o cargo de verificação através do painel (`/painel`).', ephemeral: true });
                return true;
            }

            const embedVerificacao = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('✅ 𝙑𝙚𝙧𝙞𝙛𝙞𝙘𝙖çã𝙤 𝙙𝙤 𝙎𝙚𝙧𝙫𝙞𝙙𝙤𝙧')
                .setDescription('Para teres acesso completo aos canais e conteúdos do servidor, clica no botão abaixo para te verificação.');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_verificar_membro')
                    .setLabel('Verificar-se')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
            );

            await interaction.channel.send({ embeds: [embedVerificacao], components: [row] });
            await interaction.reply({ content: '✅ Painel de verificação enviado com sucesso neste canal!', ephemeral: true });
            return true;
        }

        // 2. Botão do Painel para Configurar a Verificação
        if (isButton && interaction.customId === 'config_verificacao') {
            const selectRole = new RoleSelectMenuBuilder()
                .setCustomId('select_cargo_verificado')
                .setPlaceholder('Seleciona o cargo que será atribuído ao verificar');

            const row = new ActionRowBuilder().addComponents(selectRole);
            const rowVoltar = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('voltar_painel').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({
                content: '✅ Seleciona abaixo o **cargo** que os membros vão receber ao clicar no botão de verificação:',
                embeds: [],
                components: [row, rowVoltar]
            });
            return true;
        }

        // 3. Seleção do Cargo de Verificação no Menu
        if (isRoleSelect && interaction.customId === 'select_cargo_verificado') {
            const selectedRoleId = interaction.values[0];
            await db.collection('dados').updateOne(
                { _id: `cargo_verificado_${guildId}` },
                { $set: { value: selectedRoleId } },
                { upsert: true }
            );

            await interaction.update({
                content: `✅ Cargo de verificação configurado com sucesso para <@&${selectedRoleId}>! Já podes usar o comando \`/verificacao\` para enviar o painel.`,
                components: []
            });
            return true;
        }

        // 4. Clique do Membro no Botão de Verificar-se
        if (isButton && interaction.customId === 'btn_verificar_membro') {
            const doc = await db.collection('dados').findOne({ _id: `cargo_verificado_${guildId}` });
            const cargoVerificadoId = doc ? doc.value : null;

            if (!cargoVerificadoId) {
                await interaction.reply({ content: '❌ O cargo de verificação ainda não foi configurado pela administração.', ephemeral: true });
                return true;
            }

            const member = interaction.member;
            if (member.roles.cache.has(cargoVerificadoId)) {
                await interaction.reply({ content: '⚠️ Já estás verificado!', ephemeral: true });
                return true;
            }

            try {
                await member.roles.add(cargoVerificadoId);
                await interaction.reply({ content: '✅ Verificação realizada com sucesso! O teu cargo foi atribuído.', ephemeral: true });
            } catch (e) {
                await interaction.reply({ content: '❌ Ocorreu um erro ao tentar atribuir o cargo. Verifica as permissões e a hierarquia dos cargos do bot.', ephemeral: true });
            }
            return true;
        }

    } catch (err) {
        console.error('Erro no sistema de verificação:', err);
    }
    return true;
}

module.exports = { verificacaoCommand, handleVerificacaoInteraction };