const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField,
    ChannelSelectMenuBuilder,
    ChannelType,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const batePontoCommand = new SlashCommandBuilder()
    .setName('bateponto')
    .setDescription('Envia o painel público de Bate-Ponto no canal atual (Admin)');

const painelBatePontoCommand = new SlashCommandBuilder()
    .setName('painelbateponto')
    .setDescription('Abre o painel de configuração do Bate-Ponto (Admin)');

const resetarRankCommand = new SlashCommandBuilder()
    .setName('resetarranking')
    .setDescription('Reseta o ranking diário ou mensal (Admin)')
    .addStringOption(option =>
        option.setName('tipo')
            .setDescription('Qual ranking deseja resetar?')
            .setRequired(true)
            .addChoices(
                { name: 'Diário', value: 'diario' },
                { name: 'Mensal', value: 'mensal' }
            ));

// Função para pegar a data atual no formato YYYY-MM-DD para isolar o diário
function getDataHoje() {
    const hoje = new Date();
    return hoje.toISOString().split('T')[0];
}

// --- FUNÇÃO PARA ATUALIZAR OS RANKINGS AUTOMATICAMENTE ---
async function atualizarRanking(guild, db) {
    if (!db) return;

    const canalRankId = await db.collection('dados').findOne({ _id: `bp_canal_rank_${guild.id}` });
    if (!canalRankId || !canalRankId.value) return;

    const canalRank = guild.channels.cache.get(canalRankId.value);
    if (!canalRank) return;

    const dataHoje = getDataHoje();

    // Buscar tempos do dia atual e mensais
    const docsDiario = await db.collection('dados').find({ _id: { $regex: new RegExp(`^bp_tempo_diario_${guild.id}_${dataHoje}_`) } }).toArray();
    const docsMensal = await db.collection('dados').find({ _id: { $regex: new RegExp(`^bp_tempo_mensal_${guild.id}_`) } }).toArray();

    docsDiario.sort((a, b) => b.value - a.value);
    docsMensal.sort((a, b) => b.value - a.value);

    let rankingDiarioTxt = '';
    if (docsDiario.length === 0) {
        rankingDiarioTxt = 'Nenhum registro diário hoje.';
    } else {
        for (let i = 0; i < Math.min(docsDiario.length, 5); i++) {
            const uId = docsDiario[i]._id.replace(`bp_tempo_diario_${guild.id}_${dataHoje}_`, '');
            const mins = Math.floor(docsDiario[i].value / 60000);
            const hrs = Math.floor(mins / 60);
            rankingDiarioTxt += `**#${i + 1}** <@${uId}> ➔ **${hrs}h ${mins % 60}m**\n`;
        }
    }

    let rankingMensalTxt = '';
    if (docsMensal.length === 0) {
        rankingMensalTxt = 'Nenhum registro mensal.';
    } else {
        for (let i = 0; i < Math.min(docsMensal.length, 5); i++) {
            const uId = docsMensal[i]._id.replace(`bp_tempo_mensal_${guild.id}_`, '');
            const mins = Math.floor(docsMensal[i].value / 60000);
            const hrs = Math.floor(mins / 60);
            rankingMensalTxt += `**#${i + 1}** <@${uId}> ➔ **${hrs}h ${mins % 60}m**\n`;
        }
    }

    const embedRank = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 RANKING DE BATE-PONTO')
        .addFields(
            { name: `📅 Ranking Diário (${dataHoje})`, value: rankingDiarioTxt, inline: false },
            { name: '🗓️ Ranking Mensal', value: rankingMensalTxt, inline: false }
        )
        .setTimestamp();

    const msgRankIdDoc = await db.collection('dados').findOne({ _id: `bp_msg_rank_${guild.id}` });
    if (msgRankIdDoc && msgRankIdDoc.value) {
        try {
            const msgRank = await canalRank.messages.fetch(msgRankIdDoc.value);
            if (msgRank) {
                await msgRank.edit({ embeds: [embedRank] });
                return;
            }
        } catch (e) {}
    }

    const novaMsg = await canalRank.send({ embeds: [embedRank] });
    await db.collection('dados').updateOne(
        { _id: `bp_msg_rank_${guild.id}` },
        { $set: { value: novaMsg.id } },
        { upsert: true }
    );
}

async function handleBatePontoInteraction(interaction, db) {
    if (!db) return false;

    async function getData(key) {
        const doc = await db.collection('dados').findOne({ _id: key });
        return doc ? doc.value : null;
    }

    async function setData(key, value) {
        await db.collection('dados').updateOne(
            { _id: key },
            { $set: { value: value } },
            { upsert: true }
        );
    }

    // --- COMANDO /bateponto ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'bateponto') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: '❌ Apenas administradores podem enviar o painel.', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        const embedPonto = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`Sistema de Bate Ponto | ${interaction.guild.name}`)
            .setDescription('📥 | Clique em **ABRIR PONTO** para começar.\n🟡 | Clique em **PAUSAR / RETOMAR** para gerir a pausa.\n📤 | Clique em **ENCERRAR PONTO** para fechar.\n📋 | Clique em **VER LISTA** para ver os estados atuais.')
            .setFooter({ text: 'Todos os direitos reservados.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bp_abrir_ponto').setLabel('Abrir Ponto').setStyle(ButtonStyle.Success).setEmoji('📥'),
            new ButtonBuilder().setCustomId('bp_pausar_ponto').setLabel('Pausar / Retomar').setStyle(ButtonStyle.Secondary).setEmoji('🟡'),
            new ButtonBuilder().setCustomId('bp_encerrar_ponto').setLabel('Encerrar Ponto').setStyle(ButtonStyle.Danger).setEmoji('📤'),
            new ButtonBuilder().setCustomId('bp_ver_lista').setLabel('Ver Lista').setStyle(ButtonStyle.Primary).setEmoji('📋')
        );

        await interaction.channel.send({ embeds: [embedPonto], components: [row] });
        await interaction.reply({ content: '✅ Painel de Bate-Ponto enviado com sucesso!', flags: [MessageFlags.Ephemeral] });
        return true;
    }

    // --- COMANDO /resetarranking ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'resetarranking') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: '❌ Apenas administradores podem resetar os rankings.', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        const tipo = interaction.options.getString('tipo');
        const guildId = interaction.guild.id;
        const dataHoje = getDataHoje();

        if (tipo === 'diario') {
            await db.collection('dados').deleteMany({ _id: { $regex: new RegExp(`^bp_tempo_diario_${guildId}_${dataHoje}_`) } });
            await interaction.reply({ content: '✅ Ranking **Diário** de hoje foi resetado com sucesso!', flags: [MessageFlags.Ephemeral] });
        } else if (tipo === 'mensal') {
            await db.collection('dados').deleteMany({ _id: { $regex: new RegExp(`^bp_tempo_mensal_${guildId}_`) } });
            await interaction.reply({ content: '✅ Ranking **Mensal** foi resetado com sucesso!', flags: [MessageFlags.Ephemeral] });
        }

        await atualizarRanking(interaction.guild, db);
        return true;
    }

    // --- COMANDO /painelbateponto ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'painelbateponto') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: '❌ Apenas administradores podem abrir a configuração.', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('📁 Painel de gerenciamento')
            .setDescription('📁 **Bem-vindo ao painel de configuração!**\n# Aqui você pode configurar **todas** as funções do bot.');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bp_cfg_logs').setLabel('Definir Logs').setStyle(ButtonStyle.Primary).setEmoji('🧾'),
            new ButtonBuilder().setCustomId('bp_cfg_cargos').setLabel('Definir Cargos').setStyle(ButtonStyle.Primary).setEmoji('👤'),
            new ButtonBuilder().setCustomId('bp_cfg_canais').setLabel('Definir Canais').setStyle(ButtonStyle.Primary).setEmoji('📁')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bp_cfg_membro').setLabel('Gerenciar membro').setStyle(ButtonStyle.Primary).setEmoji('🔧'),
            new ButtonBuilder().setCustomId('bp_cfg_debug').setLabel('Debug').setStyle(ButtonStyle.Secondary).setEmoji('👾')
        );

        await interaction.reply({ embeds: [embed], components: [row1, row2], flags: [MessageFlags.Ephemeral] });
        return true;
    }

    // --- INTERAÇÕES DE BOTÕES ---
    if (interaction.isButton()) {
        const guildId = interaction.guild.id;

        // DEFINIR CANAIS
        if (interaction.customId === 'bp_cfg_canais') {
            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('🛠️ Selecione os canais de configuração abaixo:');

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bp_sel_canal_painel').setLabel('Canal do painel de ponto').setStyle(ButtonStyle.Secondary).setEmoji('📌')
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bp_sel_canal_iniciofim').setLabel('Canal de início/fim do ponto').setStyle(ButtonStyle.Secondary).setEmoji('⏰')
            );
            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bp_sel_canal_admin').setLabel('Canal de logs de Admin').setStyle(ButtonStyle.Secondary).setEmoji('🔧')
            );
            const row4 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bp_sel_canal_rank').setLabel('Canal do ranking').setStyle(ButtonStyle.Secondary).setEmoji('🏆')
            );

            await interaction.update({ embeds: [embed], components: [row1, row2, row3, row4] });
            return true;
        }

        if (['bp_sel_canal_painel', 'bp_sel_canal_iniciofim', 'bp_sel_canal_admin', 'bp_sel_canal_rank'].includes(interaction.customId)) {
            const select = new ChannelSelectMenuBuilder()
                .setCustomId(`bp_save_${interaction.customId}`)
                .setChannelTypes([ChannelType.GuildText])
                .setPlaceholder('Selecione o canal correspondente');

            const row = new ActionRowBuilder().addComponents(select);
            await interaction.reply({ content: '👇 Selecione o canal no menu abaixo:', components: [row], flags: [MessageFlags.Ephemeral] });
            return true;
        }

        // DEFINIR CARGOS
        if (interaction.customId === 'bp_cfg_cargos') {
            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('👮 Selecione os cargos abaixo para configurar o sistema:');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bp_btn_cargo_servico').setLabel('Selecione o cargo EM SERVIÇO').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('bp_btn_cargo_foraservico').setLabel('Selecione o cargo FORA DE SERVIÇO').setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({ embeds: [embed], components: [row] });
            return true;
        }

        if (interaction.customId === 'bp_btn_cargo_servico' || interaction.customId === 'bp_btn_cargo_foraservico') {
            const tipo = interaction.customId === 'bp_btn_cargo_servico' ? 'servico' : 'foraservico';
            const select = new RoleSelectMenuBuilder()
                .setCustomId(`bp_save_cargo_${tipo}`)
                .setPlaceholder(`Selecione o cargo ${tipo === 'servico' ? 'EM SERVIÇO' : 'FORA DE SERVIÇO'}`);

            const row = new ActionRowBuilder().addComponents(select);
            await interaction.reply({ content: '👇 Selecione o cargo correspondente:', components: [row], flags: [MessageFlags.Ephemeral] });
            return true;
        }

        // ABRIR PONTO
        if (interaction.customId === 'bp_abrir_ponto') {
            const userId = interaction.user.id;
            const pontoAtivo = await getData(`bp_ativo_${guildId}_${userId}`);

            if (pontoAtivo) {
                return interaction.reply({ content: '⚠️ Você já possui um ponto aberto ou pausado!', flags: [MessageFlags.Ephemeral] });
            }

            await setData(`bp_ativo_${guildId}_${userId}`, { inicio: Date.now(), status: 'aberto', tempoPausadoTotal: 0 });

            const cargoServicoId = await getData(`bp_cargo_servico_${guildId}`);
            const cargoForaId = await getData(`bp_cargo_foraservico_${guildId}`);

            if (cargoServicoId) await interaction.member.roles.add(cargoServicoId).catch(() => {});
            if (cargoForaId && cargoForaId !== cargoServicoId) await interaction.member.roles.remove(cargoForaId).catch(() => {});

            await interaction.reply({ content: '✅ **Ponto aberto com sucesso!** Bom trabalho.', flags: [MessageFlags.Ephemeral] });

            const canalLogId = await getData(`bp_canal_iniciofim_${guildId}`);
            if (canalLogId) {
                const canalLog = interaction.guild.channels.cache.get(canalLogId);
                if (canalLog) {
                    const embedLog = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🟢 Ponto Iniciado')
                        .setDescription(`👤 **Membro:** ${interaction.user}\n⏰ **Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`);
                    await canalLog.send({ embeds: [embedLog] }).catch(() => {});
                }
            }

            await atualizarRanking(interaction.guild, db);
            return true;
        }

        // PAUSAR / RETOMAR PONTO
        if (interaction.customId === 'bp_pausar_ponto') {
            const userId = interaction.user.id;
            let pontoAtivo = await getData(`bp_ativo_${guildId}_${userId}`);

            if (!pontoAtivo) {
                return interaction.reply({ content: '❌ Você não tem nenhum ponto aberto para pausar!', flags: [MessageFlags.Ephemeral] });
            }

            if (pontoAtivo.status === 'aberto') {
                pontoAtivo.status = 'pausado';
                pontoAtivo.inicioPausa = Date.now();
                await setData(`bp_ativo_${guildId}_${userId}`, pontoAtivo);
                return interaction.reply({ content: '🟡 Seu ponto foi **pausado** com sucesso!', flags: [MessageFlags.Ephemeral] });
            } else if (pontoAtivo.status === 'pausado') {
                const tempoPausaAtual = Date.now() - pontoAtivo.inicioPausa;
                pontoAtivo.tempoPausadoTotal = (pontoAtivo.tempoPausadoTotal || 0) + tempoPausaAtual;
                pontoAtivo.status = 'aberto';
                pontoAtivo.inicioPausa = null;
                await setData(`bp_ativo_${guildId}_${userId}`, pontoAtivo);
                return interaction.reply({ content: '🟢 Seu ponto foi **retomado**!', flags: [MessageFlags.Ephemeral] });
            }
        }

        // ENCERRAR PONTO
        if (interaction.customId === 'bp_encerrar_ponto') {
            const userId = interaction.user.id;
            const pontoAtivo = await getData(`bp_ativo_${guildId}_${userId}`);

            if (!pontoAtivo) {
                return interaction.reply({ content: '⚠️ Você não possui nenhum ponto aberto para encerrar!', flags: [MessageFlags.Ephemeral] });
            }

            let tempoPausaFinal = pontoAtivo.tempoPausadoTotal || 0;
            if (pontoAtivo.status === 'pausado' && pontoAtivo.inicioPausa) {
                tempoPausaFinal += (Date.now() - pontoAtivo.inicioPausa);
            }

            const tempoTotalBruto = Date.now() - pontoAtivo.inicio;
            const tempoEfetivo = Math.max(0, tempoTotalBruto - tempoPausaFinal);

            await setData(`bp_ativo_${guildId}_${userId}`, null);

            const dataHoje = getDataHoje();

            // Atualizar diário com data isolada
            const chaveDiaria = `bp_tempo_diario_${guildId}_${dataHoje}_${userId}`;
            let diarioAtual = (await getData(chaveDiaria)) || 0;
            diarioAtual += tempoEfetivo;
            await setData(chaveDiaria, diarioAtual);

            // Atualizar mensal
            const chaveMensal = `bp_tempo_mensal_${guildId}_${userId}`;
            let mensalAtual = (await getData(chaveMensal)) || 0;
            mensalAtual += tempoEfetivo;
            await setData(chaveMensal, mensalAtual);

            const cargoServicoId = await getData(`bp_cargo_servico_${guildId}`);
            const cargoForaId = await getData(`bp_cargo_foraservico_${guildId}`);

            if (cargoServicoId) await interaction.member.roles.remove(cargoServicoId).catch(() => {});
            if (cargoForaId && cargoForaId !== cargoServicoId) await interaction.member.roles.add(cargoForaId).catch(() => {});

            const minutos = Math.floor(tempoEfetivo / 60000);
            const horas = Math.floor(minutos / 60);
            const minsRest = minutos % 60;

            await interaction.reply({ content: `🔴 **Ponto encerrado!** Tempo trabalhado: **${horas}h ${minsRest}m**.`, flags: [MessageFlags.Ephemeral] });

            const canalLogId = await getData(`bp_canal_iniciofim_${guildId}`);
            if (canalLogId) {
                const canalLog = interaction.guild.channels.cache.get(canalLogId);
                if (canalLog) {
                    const embedLog = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🔴 Ponto Encerrado')
                        .setDescription(`👤 **Membro:** ${interaction.user}\n⏱️ **Tempo Líquido:** ${horas}h ${minsRest}m`);
                    await canalLog.send({ embeds: [embedLog] }).catch(() => {});
                }
            }

            await atualizarRanking(interaction.guild, db);
            return true;
        }

        // VER LISTA
        if (interaction.customId === 'bp_ver_lista') {
            await interaction.guild.members.fetch().catch(() => {});

            const todosAtivos = await db.collection('dados').find({ _id: { $regex: new RegExp(`^bp_ativo_${guildId}_`) } }).toArray();

            let emServicoTxt = '';
            let emPausaTxt = '';

            for (const doc of todosAtivos) {
                if (!doc.value) continue;
                const uId = doc._id.replace(`bp_ativo_${guildId}_`, '');
                if (doc.value.status === 'pausado') {
                    emPausaTxt += `<@${uId}>\n`;
                } else {
                    emServicoTxt += `<@${uId}>\n`;
                }
            }

            const cargoForaId = await getData(`bp_cargo_foraservico_${guildId}`);
            let foraServicoTxt = '';

            if (cargoForaId) {
                const cargoObj = interaction.guild.roles.cache.get(cargoForaId);
                if (cargoObj) {
                    cargoObj.members.forEach(m => {
                        if (!m.user.bot) foraServicoTxt += `<@${m.id}>\n`;
                    });
                }
            }

            const embedLista = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('📋 LISTA DE MEMBROS')
                .addFields(
                    { name: '🟢 Em Serviço', value: emServicoTxt || 'Ninguém no momento.', inline: false },
                    { name: '🟡 Em Pausa', value: emPausaTxt || 'Ninguém em pausa.', inline: false },
                    { name: '🔴 Fora de Serviço', value: foraServicoTxt || 'Ninguém listado.', inline: false }
                );

            await interaction.reply({ embeds: [embedLista], flags: [MessageFlags.Ephemeral] });
            return true;
        }
    }

    // --- SELECT MENUS DE CANAIS E CARGOS ---
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('bp_save_')) {
        const canalId = interaction.values[0];
        const guildId = interaction.guild.id;

        if (interaction.customId === 'bp_save_bp_sel_canal_painel') {
            await setData(`bp_canal_painel_${guildId}`, canalId);
            const targetChannel = interaction.guild.channels.cache.get(canalId);
            if (targetChannel) {
                const embedPonto = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`Sistema de Bate Ponto | ${interaction.guild.name}`)
                    .setDescription('📥 | Clique em **ABRIR PONTO** para começar.\n🟡 | Clique em **PAUSAR / RETOMAR** para gerir a pausa.\n📤 | Clique em **ENCERRAR PONTO** para fechar.\n📋 | Clique em **VER LISTA** para ver os estados atuais.');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bp_abrir_ponto').setLabel('Abrir Ponto').setStyle(ButtonStyle.Success).setEmoji('📥'),
                    new ButtonBuilder().setCustomId('bp_pausar_ponto').setLabel('Pausar / Retomar').setStyle(ButtonStyle.Secondary).setEmoji('🟡'),
                    new ButtonBuilder().setCustomId('bp_encerrar_ponto').setLabel('Encerrar Ponto').setStyle(ButtonStyle.Danger).setEmoji('📤'),
                    new ButtonBuilder().setCustomId('bp_ver_lista').setLabel('Ver Lista').setStyle(ButtonStyle.Primary).setEmoji('📋')
                );

                await targetChannel.send({ embeds: [embedPonto], components: [row] });
            }
        }

        if (interaction.customId === 'bp_save_bp_sel_canal_iniciofim') await setData(`bp_canal_iniciofim_${guildId}`, canalId);
        if (interaction.customId === 'bp_save_bp_sel_canal_admin') await setData(`bp_canal_admin_${guildId}`, canalId);
        if (interaction.customId === 'bp_save_bp_sel_canal_rank') {
            await setData(`bp_canal_rank_${guildId}`, canalId);
            await atualizarRanking(interaction.guild, db);
        }

        await interaction.update({ content: `✅ Canal configurado com sucesso!`, components: [] });
        return true;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('bp_save_cargo_')) {
        const roleId = interaction.values[0];
        const tipo = interaction.customId.replace('bp_save_cargo_', '');
        await setData(`bp_cargo_${tipo}_${interaction.guild.id}`, roleId);

        await interaction.update({ content: `✅ Cargo configurado com sucesso!`, components: [] });
        return true;
    }

    // --- MANUSEIO DE MODAIS ---
    if (interaction.isModalSubmit()) {
        const guildId = interaction.guild.id;

        if (interaction.customId === 'bp_modal_pedir_id_membro') {
            const targetId = interaction.fields.getTextInputValue('id_usuario_target').trim();
            const dataHoje = getDataHoje();
            
            const tempoDiarioMs = (await getData(`bp_tempo_diario_${guildId}_${dataHoje}_${targetId}`)) || 0;
            const tempoMensalMs = (await getData(`bp_tempo_mensal_${guildId}_${targetId}`)) || 0;

            const minsDiario = Math.floor(tempoDiarioMs / 60000);
            const hrsDiario = Math.floor(minsDiario / 60);

            const minsMensal = Math.floor(tempoMensalMs / 60000);
            const hrsMensal = Math.floor(minsMensal / 60);

            const embedGerenciar = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('⏰ Gerenciamento de Pontos')
                .setDescription(
                    `👤 **Gerenciando:** <@${targetId}>\n\n` +
                    `📅 **Tempo Hoje:** ${hrsDiario}h ${minsDiario % 60}m\n` +
                    `🗓️ **Tempo Mensal:** ${hrsMensal}h ${minsMensal % 60}m\n\n` +
                    `📝 **Ações Disponíveis:**\n` +
                    `Use os botões abaixo para gerir o tempo.`
                );

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bp_act_add_${targetId}`).setLabel('Adicionar Tempo').setStyle(ButtonStyle.Primary).setEmoji('➕'),
                new ButtonBuilder().setCustomId(`bp_act_rem_${targetId}`).setLabel('Remover Tempo').setStyle(ButtonStyle.Primary).setEmoji('➖')
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bp_act_encerrar_${targetId}`).setLabel('Encerrar ponto').setStyle(ButtonStyle.Danger).setEmoji('📤'),
                new ButtonBuilder().setCustomId(`bp_act_reset_${targetId}`).setLabel('Resetar Membro').setStyle(ButtonStyle.Danger).setEmoji('🔄')
            );

            await interaction.reply({ embeds: [embedGerenciar], components: [row1, row2], flags: [MessageFlags.Ephemeral] });
            return true;
        }

        if (interaction.customId.startsWith('bp_modal_add_tempo_') || interaction.customId.startsWith('bp_modal_rem_tempo_')) {
            const isAdd = interaction.customId.startsWith('bp_modal_add_tempo_');
            const targetId = interaction.customId.replace(isAdd ? 'bp_modal_add_tempo_' : 'bp_modal_rem_tempo_', '');
            const minsInput = parseInt(interaction.fields.getTextInputValue('minutos_val'));

            if (isNaN(minsInput) || minsInput <= 0) {
                return interaction.reply({ content: '❌ Valor inválido.', flags: [MessageFlags.Ephemeral] });
            }

            const deltaMs = minsInput * 60000;
            const dataHoje = getDataHoje();

            const chaveDiaria = `bp_tempo_diario_${guildId}_${dataHoje}_${targetId}`;
            const chaveMensal = `bp_tempo_mensal_${guildId}_${targetId}`;

            let diarioAtual = (await getData(chaveDiaria)) || 0;
            let mensalAtual = (await getData(chaveMensal)) || 0;

            if (isAdd) {
                diarioAtual += deltaMs;
                mensalAtual += deltaMs;
            } else {
                diarioAtual = Math.max(0, diarioAtual - deltaMs);
                mensalAtual = Math.max(0, mensalAtual - deltaMs);
            }

            await setData(chaveDiaria, diarioAtual);
            await setData(chaveMensal, mensalAtual);

            await interaction.reply({ content: `✅ **Tempo ${isAdd ? 'adicionado' : 'removido'} com sucesso!**`, flags: [MessageFlags.Ephemeral] });
            await atualizarRanking(interaction.guild, db);
            return true;
        }
    }

    // --- GERENCIAR AÇÕES DE MEMBRO (BOTÕES DE RESET / ADD / REM / ENCERRAR) ---
    if (interaction.isButton() && interaction.customId.startsWith('bp_act_')) {
        const guildId = interaction.guild.id;
        const partes = interaction.customId.split('_');
        const acao = partes[2];
        const targetId = partes[3];

        if (acao === 'add' || acao === 'rem') {
            const modal = new ModalBuilder()
                .setCustomId(`bp_modal_${acao}_tempo_${targetId}`)
                .setTitle(acao === 'add' ? 'Adicionar Tempo' : 'Remover Tempo');

            const input = new TextInputBuilder()
                .setCustomId('minutos_val')
                .setLabel('Quantidade em minutos')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (acao === 'encerrar') {
            await setData(`bp_ativo_${guildId}_${targetId}`, null);

            const cargoServicoId = await getData(`bp_cargo_servico_${guildId}`);
            const cargoForaId = await getData(`bp_cargo_foraservico_${guildId}`);

            try {
                const memberTarget = await interaction.guild.members.fetch(targetId);
                if (memberTarget) {
                    if (cargoServicoId) await memberTarget.roles.remove(cargoServicoId).catch(() => {});
                    if (cargoForaId && cargoForaId !== cargoServicoId) await memberTarget.roles.add(cargoForaId).catch(() => {});
                }
            } catch (e) {}

            await interaction.reply({ content: `🔴 Ponto de <@${targetId}> encerrado manualmente!`, flags: [MessageFlags.Ephemeral] });
            await atualizarRanking(interaction.guild, db);
            return true;
        }

        if (acao === 'reset') {
            const dataHoje = getDataHoje();
            await setData(`bp_tempo_diario_${guildId}_${dataHoje}_${targetId}`, 0);
            await setData(`bp_tempo_mensal_${guildId}_${targetId}`, 0);
            await setData(`bp_ativo_${guildId}_${targetId}`, null);

            const cargoServicoId = await getData(`bp_cargo_servico_${guildId}`);
            const cargoForaId = await getData(`bp_cargo_foraservico_${guildId}`);

            try {
                const memberTarget = await interaction.guild.members.fetch(targetId);
                if (memberTarget) {
                    if (cargoServicoId) await memberTarget.roles.remove(cargoServicoId).catch(() => {});
                    if (cargoForaId && cargoForaId !== cargoServicoId) await memberTarget.roles.add(cargoForaId).catch(() => {});
                }
            } catch (e) {}

            await interaction.reply({ content: `🔄 Informações de ponto de <@${targetId}> foram resetadas!`, flags: [MessageFlags.Ephemeral] });
            await atualizarRanking(interaction.guild, db);
            return true;
        }
    }

    return false;
}

module.exports = {
    batePontoCommand,
    painelBatePontoCommand,
    resetarRankCommand,
    handleBatePontoInteraction
};
