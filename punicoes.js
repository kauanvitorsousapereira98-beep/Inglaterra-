const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');

const punirCommand = new SlashCommandBuilder()
    .setName('punicoes')
    .setDescription('Abre o painel interativo de gerenciamento e aplicação de punições');

async function getData(db, key) {
    if (!db) return null;
    const doc = await db.collection('dados').findOne({ _id: key });
    return doc ? doc.value : null;
}

async function setData(db, key, value) {
    if (!db) return;
    await db.collection('dados').updateOne(
        { _id: key },
        { $set: { value: value } },
        { upsert: true }
    );
}

async function deleteData(db, key) {
    if (!db) return;
    await db.collection('dados').deleteOne({ _id: key });
}

async function getOrCreatePunicaoTemp(db, userId, guildId) {
    const key = `temp_punicao_${guildId}_${userId}`;
    let data = await getData(db, key);
    if (!data) {
        data = {
            membroId: '',
            idFiveM: '',
            tipoPunicao: 'ADV 1',
            duracao: '30m',
            motivo: 'Tumulto em call'
        };
        await setData(db, key, data);
    }
    return data;
}

async function verificarProximoAdv(db, guild, membroId) {
    try {
        const membro = await guild.members.fetch(membroId).catch(() => null);
        if (!membro) return 'ADV 1';

        const cargoAdv3 = await getData(db, `cargo_punicao_${guild.id}_ADV 3`);
        const cargoAdv2 = await getData(db, `cargo_punicao_${guild.id}_ADV 2`);
        const cargoAdv1 = await getData(db, `cargo_punicao_${guild.id}_ADV 1`);

        if (cargoAdv3 && membro.roles.cache.has(cargoAdv3)) return 'ADV 3';
        if (cargoAdv2 && membro.roles.cache.has(cargoAdv2)) return 'ADV 3';
        if (cargoAdv1 && membro.roles.cache.has(cargoAdv1)) return 'ADV 2';
    } catch (e) {}
    return 'ADV 1';
}

function converterDuracaoParaMs(str) {
    const match = str.trim().match(/^(\d+)([mhdw])$/i);
    if (!match) return 30 * 60 * 1000;
    const valor = parseInt(match[1]);
    const tipo = match[2].toLowerCase();

    if (tipo === 'm') return valor * 60 * 1000;                      // Minutos
    if (tipo === 'h') return valor * 60 * 60 * 1000;                 // Horas
    if (tipo === 'd') return valor * 24 * 60 * 60 * 1000;            // Dias
    if (tipo === 'w') return valor * 7 * 24 * 60 * 60 * 1000;        // Semanas
    
    return 30 * 60 * 1000;
}

function formatarDataHora(date = new Date()) {
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function agendarExpiracaoPunicao(client, db, guildId, membroId, cargoId, tipoPunicao, tempoMs) {
    const expiraEm = Date.now() + tempoMs;
    await setData(db, `punicao_ativa_${guildId}_${membroId}`, { cargoId, tipoPunicao, expiraEm });
}

async function removerPunicaoAutomatica(client, db, guildId, membroId, cargoId, tipoPunicao) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        if (tipoPunicao === 'Banimento') {
            await guild.members.unban(membroId, 'Expiração automática do tempo de banimento.').catch(() => {});
        } else if (cargoId) {
            const membro = await guild.members.fetch(membroId).catch(() => null);
            if (membro) {
                await membro.roles.remove(cargoId).catch(() => {});
            }
        }

        const canalLogPunicaoId = await getData(db, `canal_log_punicao_${guildId}`);
        if (canalLogPunicaoId) {
            const canalLog = guild.channels.cache.get(canalLogPunicaoId);
            if (canalLog) {
                const embedExpiracao = new EmbedBuilder()
                    .setColor('#F1C40F')
                    .setTitle('⏳ Punição Expirada / Removida Automaticamente')
                    .setDescription(`A punição (**${tipoPunicao}**) de <@${membroId}> expirou e foi retirada automaticamente pelo sistema.`);
                await canalLog.send({ embeds: [embedExpiracao] }).catch(() => {});
            }
        }
    } catch (e) {
        console.error('Erro ao remover punição automática:', e);
    } finally {
        await deleteData(db, `punicao_ativa_${guildId}_${membroId}`);
    }
}

async function verificarPunionsPendentesAoIniciar(client, db) {
    setInterval(async () => {
        try {
            if (!db) return;
            const allDocs = await db.collection('dados').find({ _id: { $regex: /^punicao_ativa_/ } }).toArray();
            const agora = Date.now();

            for (const doc of allDocs) {
                const dados = doc.value;
                const partes = doc._id.replace('punicao_ativa_', '').split('_');
                const guildId = partes[0];
                const membroId = partes[1];

                if (!dados || !dados.expiraEm) continue;

                if (agora >= dados.expiraEm) {
                    await removerPunicaoAutomatica(client, db, guildId, membroId, dados.cargoId, dados.tipoPunicao);
                }
            }
        } catch (err) {
            console.error("Erro na verificação automática de punições:", err);
        }
    }, 60 * 1000); // Verifica a cada 1 minuto
}

async function gerarEmbedPunicao(db, data, staffUser, guild) {
    const membroMencao = data.membroId ? `<@${data.membroId}>` : 'Não definido';
    const staffMencao = staffUser ? `<@${staffUser.id}>` : 'Não definido';

    const tipoLimpo = data.tipoPunicao ? data.tipoPunicao.trim() : 'ADV 1';
    const cargoIdSalvo = await getData(db, `cargo_punicao_${guild.id}_${tipoLimpo}`);
    const cargoExibicao = cargoIdSalvo ? `<@&${cargoIdSalvo}>` : 'Não vinculado';

    return new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🔴 Nova Punição (Prévia)')
        .addFields(
            { name: '👤 Membro Advertido', value: membroMencao, inline: true },
            { name: '🛡️ Aplicado por', value: staffMencao, inline: true },
            { name: '🆔 ID FiveM', value: data.idFiveM || 'Não informado', inline: true },
            { name: '⚠️ Tipo de Punição', value: data.tipoPunicao, inline: true },
            { name: '🛡️ Cargo Vinculado', value: cargoExibicao, inline: true },
            { name: '⏳ Duração', value: data.duracao, inline: true },
            { name: '📅 Data', value: formatarDataHora(), inline: false },
            { name: '📝 Motivo', value: data.motivo, inline: false }
        );
}

function criarLinhasPainel() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pun_membro').setLabel('Membro').setStyle(ButtonStyle.Primary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('pun_id').setLabel('ID FiveM').setStyle(ButtonStyle.Primary).setEmoji('🆔'),
        new ButtonBuilder().setCustomId('pun_tipo_menu').setLabel('Selecionar Tipo').setStyle(ButtonStyle.Primary).setEmoji('⚠️')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pun_vincular_cargo').setLabel('Vincular Cargo').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
        new ButtonBuilder().setCustomId('pun_duracao').setLabel('Duração').setStyle(ButtonStyle.Secondary).setEmoji('⏳'),
        new ButtonBuilder().setCustomId('pun_motivo').setLabel('Motivo').setStyle(ButtonStyle.Secondary).setEmoji('📝')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pun_enviar').setLabel('📤 Enviar Punição').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pun_resetar').setLabel('🔄 Resetar').setStyle(ButtonStyle.Danger)
    );

    return [row1, row2, row3];
}

async function renderizarPainel(db, interaction, isUpdate = false) {
    const user = interaction.user;
    const guild = interaction.guild;
    const data = await getOrCreatePunicaoTemp(db, user.id, guild.id);
    const embedPreview = await gerarEmbedPunicao(db, data, user, guild);

    const painelInfo = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🚨 Painel de Gerenciamento de Punições')
        .setDescription('Configure os campos abaixo e clique em **Enviar Punição**.');

    const payload = {
        embeds: [painelInfo, embedPreview],
        components: criarLinhasPainel(),
        ephemeral: true
    };

    try {
        if (isUpdate && interaction.isRepliable()) {
            return await interaction.update(payload).catch(() => {});
        }
        if (interaction.isChatInputCommand()) {
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply(payload).catch(() => {});
            }
            return await interaction.reply(payload).catch(() => {});
        } else {
            if (interaction.isRepliable()) {
                return await interaction.update(payload).catch(() => {});
            }
        }
    } catch (e) {}
}

async function handlePunicoesInteraction(interaction, db) {
    const isPunicoesCommand = interaction.isChatInputCommand() && interaction.commandName === 'punicoes';
    const isPunicoesButton = interaction.isButton() && interaction.customId.startsWith('pun_');
    const isMembroSelect = interaction.isUserSelectMenu() && interaction.customId === 'select_membro_punido';
    const isCargoSelect = interaction.isRoleSelectMenu() && interaction.customId === 'select_cargo_punicao';
    const isTipoSelect = interaction.isStringSelectMenu() && interaction.customId === 'select_tipo_punicao';
    const isPunicoesModal = interaction.isModalSubmit() && interaction.customId.startsWith('modal_pun_');

    if (!isPunicoesCommand && !isPunicoesButton && !isMembroSelect && !isCargoSelect && !isTipoSelect && !isPunicoesModal) {
        return false; 
    }

    try {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const guild = interaction.guild;

        if (isPunicoesCommand) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true }).catch(() => {});
            }
            await renderizarPainel(db, interaction, false);
            return true;
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'pun_membro') {
                const select = new UserSelectMenuBuilder()
                    .setCustomId('select_membro_punido')
                    .setPlaceholder('Selecione o membro que vai receber a punição');
                const row = new ActionRowBuilder().addComponents(select);
                await interaction.update({ content: '👤 Selecione o membro abaixo:', components: [row], embeds: [] }).catch(() => {});
                return true;
            }

            if (interaction.customId === 'pun_tipo_menu') {
                const selectTipo = new StringSelectMenuBuilder()
                    .setCustomId('select_tipo_punicao')
                    .setPlaceholder('Selecione o tipo de punição')
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('ADV 1').setValue('ADV 1').setDescription('Aplicar Advertência 1').setEmoji('⚠️'),
                        new StringSelectMenuOptionBuilder().setLabel('ADV 2').setValue('ADV 2').setDescription('Aplicar Advertência 2').setEmoji('⚠️'),
                        new StringSelectMenuOptionBuilder().setLabel('ADV 3').setValue('ADV 3').setDescription('Aplicar Advertência 3').setEmoji('⚠️'),
                        new StringSelectMenuOptionBuilder().setLabel('Banimento').setValue('Banimento').setDescription('Aplicar Banimento').setEmoji('🔨')
                    );
                const row = new ActionRowBuilder().addComponents(selectTipo);
                await interaction.update({ content: '⚠️ Selecione o tipo de punição abaixo:', components: [row], embeds: [] }).catch(() => {});
                return true;
            }

            if (interaction.customId === 'pun_vincular_cargo') {
                let data = await getOrCreatePunicaoTemp(db, userId, guildId);
                const selectRole = new RoleSelectMenuBuilder()
                    .setCustomId('select_cargo_punicao')
                    .setPlaceholder(`Selecione qual cargo será o [${data.tipoPunicao}]`);
                const row = new ActionRowBuilder().addComponents(selectRole);
                await interaction.update({ content: `🛡️ Selecione o cargo correspondente a **${data.tipoPunicao}** na lista abaixo:`, components: [row], embeds: [] }).catch(() => {});
                return true;
            }

            if (interaction.customId === 'pun_id') {
                const modal = new ModalBuilder().setCustomId('modal_pun_id').setTitle('Definir ID FiveM');
                const input = new TextInputBuilder()
                    .setCustomId('val_id')
                    .setLabel('ID do Jogador (ex: 722 ou 96966)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(10)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                return true;
            }

            if (interaction.customId === 'pun_duracao') {
                const modal = new ModalBuilder().setCustomId('modal_pun_duracao').setTitle('Definir Duração');
                const input = new TextInputBuilder().setCustomId('val_duracao').setLabel('Ex: 30m, 2h, 30d, 1w').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                return true;
            }

            if (interaction.customId === 'pun_motivo') {
                const modal = new ModalBuilder().setCustomId('modal_pun_motivo').setTitle('Definir Motivo');
                const input = new TextInputBuilder().setCustomId('val_motivo').setLabel('Motivo da advertência').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                return true;
            }

            if (interaction.customId === 'pun_resetar') {
                await deleteData(db, `temp_punicao_${guildId}_${userId}`);
                await renderizarPainel(db, interaction, true);
                return true;
            }

            if (interaction.customId === 'pun_enviar') {
                let data = await getOrCreatePunicaoTemp(db, userId, guildId);
                if (!data.membroId || !data.idFiveM) {
                    if (interaction.isRepliable()) {
                        await interaction.reply({ content: '❌ Você precisa definir pelo menos o **Membro** e o **ID FiveM** antes de enviar!', ephemeral: true }).catch(() => {});
                    }
                    return true;
                }

                await interaction.update({ content: '🔄 Processando envio da punição...', components: [], embeds: [] }).catch(() => {});

                const dataPunicaoFormatada = formatarDataHora();
                const tipoLimpo = data.tipoPunicao.trim();
                
                const cargoConfigId = await getData(db, `cargo_punicao_${guildId}_${tipoLimpo}`);
                const mencaoCargoFinal = cargoConfigId ? `<@&${cargoConfigId}>` : `Cargo não vinculado (${data.tipoPunicao})`;

                const embedFinal = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('🔴 Nova Punição Aplicada')
                    .addFields(
                        { name: '👤 Membro Advertido', value: `<@${data.membroId}>`, inline: true },
                        { name: '🛡️ Aplicado por', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '🆔 ID FiveM', value: data.idFiveM, inline: true },
                        { name: '⚠️ Cargo Atribuído', value: mencaoCargoFinal, inline: true },
                        { name: '⏳ Duração', value: data.duracao, inline: true },
                        { name: '📅 Data', value: dataPunicaoFormatada, inline: false },
                        { name: '📝 Motivo', value: data.motivo, inline: false }
                    );
                
                const canalLogPunicaoId = await getData(db, `canal_log_punicao_${guildId}`);
                const canalAvisosPunicaoId = await getData(db, `canal_avisos_punicao_${guildId}`);
                
                if (canalLogPunicaoId) {
                    const canalLog = guild.channels.cache.get(canalLogPunicaoId);
                    if (canalLog) await canalLog.send({ embeds: [embedFinal] }).catch(() => {});
                }

                if (canalAvisosPunicaoId) {
                    const canalAvisos = guild.channels.cache.get(canalAvisosPunicaoId);
                    if (canalAvisos) await canalAvisos.send({ embeds: [embedFinal] }).catch(() => {});
                }

                let statusCargo = 'Cargo aplicado com sucesso!';
                if (tipoLimpo === 'Banimento') {
                    try {
                        await guild.members.ban(data.membroId, { reason: data.motivo });
                        statusCargo = 'Usuário banido com sucesso!';
                    } catch (err) {
                        statusCargo = 'Falha ao banir o usuário (Verifique as permissões do bot).';
                    }
                } else if (cargoConfigId) {
                    try {
                        const membroAlvo = await guild.members.fetch(data.membroId);
                        if (membroAlvo) {
                            await membroAlvo.roles.add(cargoConfigId);
                        }
                    } catch (err) {
                        statusCargo = 'Punição salva, mas **falhou ao dar o cargo** (Verifique a hierarquia dos cargos).';
                    }
                } else {
                    statusCargo = 'Punição salva, mas **nenhum cargo estava vinculado** para este tipo.';
                }

                const tempoMs = converterDuracaoParaMs(data.duracao);
                await agendarExpiracaoPunicao(interaction.client, db, guildId, data.membroId, cargoConfigId, tipoLimpo, tempoMs);

                await deleteData(db, `temp_punicao_${guildId}_${userId}`);
                
                await interaction.editReply({ 
                    content: `✅ Punição registrada com sucesso!\nℹ️ ${statusCargo}\n⏳ A punição será removida automaticamente após **${data.duracao}**.`, 
                    components: [] 
                }).catch(() => {});
                return true;
            }
        }

        if (interaction.isUserSelectMenu() && interaction.customId === 'select_membro_punido') {
            let data = await getOrCreatePunicaoTemp(db, userId, guildId);
            data.membroId = interaction.values[0];
            data.tipoPunicao = await verificarProximoAdv(db, guild, data.membroId);

            await setData(db, `temp_punicao_${guildId}_${userId}`, data);
            await renderizarPainel(db, interaction, true);
            return true;
        }

        if (interaction.isRoleSelectMenu() && interaction.customId === 'select_cargo_punicao') {
            let data = await getOrCreatePunicaoTemp(db, userId, guildId);
            const cargoIdEscolhido = interaction.values[0];
            const tipoPuni = data.tipoPunicao.trim();
            await setData(db, `cargo_punicao_${guildId}_${tipoPuni}`, cargoIdEscolhido);
            await renderizarPainel(db, interaction, true);
            return true;
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_tipo_punicao') {
            let data = await getOrCreatePunicaoTemp(db, userId, guildId);
            data.tipoPunicao = interaction.values[0];
            await setData(db, `temp_punicao_${guildId}_${userId}`, data);
            await renderizarPainel(db, interaction, true);
            return true;
        }

        if (interaction.isModalSubmit()) {
            let data = await getOrCreatePunicaoTemp(db, userId, guildId);
            if (interaction.customId === 'modal_pun_id') {
                data.idFiveM = interaction.fields.getTextInputValue('val_id');
                await setData(db, `temp_punicao_${guildId}_${userId}`, data);
                if (interaction.isRepliable()) {
                    await interaction.reply({ content: '✅ ID FiveM salvo com sucesso!', ephemeral: true }).catch(() => {});
                }
                await renderizarPainel(db, interaction, false);
                return true;
            } 
            if (interaction.customId === 'modal_pun_duracao') {
                data.duracao = interaction.fields.getTextInputValue('val_duracao');
                await setData(db, `temp_punicao_${guildId}_${userId}`, data);
                if (interaction.isRepliable()) {
                    await interaction.reply({ content: '✅ Duração salva com sucesso!', ephemeral: true }).catch(() => {});
                }
                return true;
            } 
            if (interaction.customId === 'modal_pun_motivo') {
                data.motivo = interaction.fields.getTextInputValue('val_motivo');
                await setData(db, `temp_punicao_${guildId}_${userId}`, data);
                if (interaction.isRepliable()) {
                    await interaction.reply({ content: '✅ Motivo salvo com sucesso!', ephemeral: true }).catch(() => {});
                }
                return true;
            }
        }
    } catch (err) {
        console.error("Erro na interação de punições:", err);
    }

    return true;
}

async function handlePunicoesMessage(message, PREFIX, db) {
    if (message.author.bot || !message.guild) return false;

    if (message.content.toLowerCase() === `${PREFIX}punicoes` || message.content.toLowerCase() === `${PREFIX}punir`) {
        await renderizarPainel(db, message, false);
        return true;
    }
    return false;
}

module.exports = { 
    punirCommand, 
    handlePunicoesInteraction, 
    handlePunicoesMessage, 
    verificarPunionsPendentesAoIniciar 
}; punirCommand, 
    handlePunicoesInteraction, 
    handlePunicoesMessage, 
    verificarPunionsPendentesAoIniciar 
};