const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder,
    ChannelType,
    PermissionsBitField,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const recrutamentoCommand = new SlashCommandBuilder()
    .setName('recrutamento')
    .setDescription('Envia o painel da Central de Recrutamento no canal atual (Admin)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

const configRecrutamentoCommand = new SlashCommandBuilder()
    .setName('configrec')
    .setDescription('Abre o painel de configuração do sistema de recrutamento (Admin)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

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

function formatarData() {
    return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarHorario() {
    return new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Enviar Painel Público da Central
async function enviarCentralRecrutamento(interaction, db) {
    const guildId = interaction.guild.id;
    
    const titulo = (await getData(db, `rec_titulo_${guildId}`)) || 'Central de Recrutamento';
    const desc = (await getData(db, `rec_desc_${guildId}`)) || 'Bem-vindo ao **Sistema Oficial de Recrutamento**.\nSe deseja ingressar na organização, clique no botão abaixo e preencha o formulário.';
    const bannerUrl = (await getData(db, `rec_banner_${guildId}`)) || 'https://images.contentstack.io/v3/assets/bltb6530b271fca0b16/blt6d9e03d40e1f7c78/recrutamento_banner.png';
    const thumbnailUrl = interaction.guild.iconURL({ dynamic: true }) || 'https://i.imgur.com/exemploThumb.png';

    const embed = new EmbedBuilder()
        .setColor('#111214')
        .setAuthor({ name: `📋 | ${titulo}`, iconURL: thumbnailUrl })
        .setDescription(desc)
        .setThumbnail(thumbnailUrl)
        .setImage(bannerUrl)
        .setFooter({ text: 'Organizações • Roleplay | Desenvolvido por lk' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_iniciar_modal_rec').setLabel('Preencher Formulário').setStyle(ButtonStyle.Secondary).setEmoji('📝')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Central de Recrutamento enviada com sucesso!', ephemeral: true });
}

// Abrir Painel Principal de Configuração da Staff
async function abrirPainelConfig(interaction) {
    const embedCfg = new EmbedBuilder()
        .setColor('#111214')
        .setTitle('⚙️ Configuração do Recrutamento')
        .setDescription('Gerencie o sistema de recrutamento através das opções abaixo.');

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_ver_status').setLabel('Configuração').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
        new ButtonBuilder().setCustomId('cfg_definir_dados').setLabel('Definir configurações').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
        new ButtonBuilder().setCustomId('cfg_gerenciar_perguntas').setLabel('Gerenciar perguntas').setStyle(ButtonStyle.Secondary).setEmoji('❓')
    );

    const payload = { embeds: [embedCfg], components: [row1], ephemeral: true };
    if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
            return interaction.followUp(payload);
        }
        return interaction.reply(payload);
    }
}

async function handleRecrutamentoInteraction(interaction, db) {
    const guildId = interaction.guild?.id;

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'recrutamento') {
            await enviarCentralRecrutamento(interaction, db);
            return true;
        }
        if (interaction.commandName === 'configrec') {
            await abrirPainelConfig(interaction);
            return true;
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'btn_iniciar_modal_rec') {
            const perguntas = (await getData(db, `rec_perguntas_${guildId}`)) || [];
            if (perguntas.length === 0) {
                return interaction.reply({ content: '❌ O recrutamento está temporariamente fechado (Nenhuma pergunta cadastrada).', ephemeral: true });
            }

            const sessaoAtiva = await getData(db, `rec_sessao_${interaction.user.id}`);
            if (sessaoAtiva) {
                return interaction.reply({ content: `❌ Já tens um recrutamento em aberto em <#${sessaoAtiva.channelId}>!`, ephemeral: true });
            }

            const modal = new ModalBuilder().setCustomId('modal_dados_candidato').setTitle('Iniciar Recrutamento');
            const inputNome = new TextInputBuilder().setCustomId('cad_nome').setLabel('Nome no RP').setStyle(TextInputStyle.Short).setPlaceholder('Ex: João Silva').setRequired(true);
            const inputId = new TextInputBuilder().setCustomId('cad_id').setLabel('ID').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 1234').setRequired(true);
            const inputIdade = new TextInputBuilder().setCustomId('cad_idade').setLabel('Idade').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 18').setRequired(true);
            const inputTempoRp = new TextInputBuilder().setCustomId('cad_tempogta').setLabel('Tempo de RP').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 2 anos').setRequired(true);
            const inputDisp = new TextInputBuilder().setCustomId('cad_disp').setLabel('Disponibilidade diária').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 6 horas').setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(inputNome),
                new ActionRowBuilder().addComponents(inputId),
                new ActionRowBuilder().addComponents(inputIdade),
                new ActionRowBuilder().addComponents(inputTempoRp),
                new ActionRowBuilder().addComponents(inputDisp)
            );

            return interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_cancelar_rec') {
            await db.collection('dados').deleteOne({ _id: `rec_sessao_${interaction.user.id}` });
            await interaction.channel.send('🔒 Recrutamento cancelado e encerrado.');
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            return true;
        }

        if (interaction.customId === 'voltar_cfg') {
            return abrirPainelConfig(interaction);
        }

        if (interaction.customId === 'cfg_ver_status') {
            const catId = await getData(db, `rec_categoria_${guildId}`);
            const logId = await getData(db, `rec_canal_relatorios_${guildId}`);
            const anuncioId = await getData(db, `rec_canal_anuncio_${guildId}`);
            const cargoAprovado = await getData(db, `rec_cargo_aprovado_${guildId}`);
            const cargoRemover = await getData(db, `rec_cargo_remover_${guildId}`);
            const perguntas = (await getData(db, `rec_perguntas_${guildId}`)) || [];

            const embedStatus = new EmbedBuilder()
                .setColor('#111214')
                .setTitle('⚙️ Configuração do Recrutamento')
                .setDescription(
                    `Confira abaixo o estado atual do sistema.\n\n` +
                    `📁 **Categoria**\n${catId ? `<#${catId}>` : 'Não configurado'}\n\n` +
                    `📡 **Canal de relatórios**\n${logId ? `<#${logId}>` : 'Não configurado'}\n\n` +
                    `📢 **Canal de anúncios**\n${anuncioId ? `<#${anuncioId}>` : 'Não configurado'}\n\n` +
                    `✅ **Cargo ao aprovar**\n${cargoAprovado ? `<@&${cargoAprovado}>` : 'Não configurado'}\n\n` +
                    `❌ **Cargo removido ao aprovar**\n${cargoRemover ? `<@&${cargoRemover}>` : 'Não configurado'}\n\n` +
                    `❓ **Perguntas cadastradas**\n${perguntas.length}/20`
                );

            const rowVoltar = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('voltar_cfg').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('↩️')
            );

            return interaction.update({ embeds: [embedStatus], components: [rowVoltar] });
        }

        if (interaction.customId === 'cfg_definir_dados') {
            const embedDef = new EmbedBuilder()
                .setColor('#111214')
                .setTitle('🛠️ Definir Configurações')
                .setDescription('Selecione abaixo o que deseja configurar no sistema de recrutamento:');

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('set_rec_cat').setLabel('📁 Categoria').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('set_rec_log').setLabel('📡 Canal Relatórios').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('set_rec_anuncio').setLabel('📢 Canal Anúncios').setStyle(ButtonStyle.Primary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('set_rec_cargo_aprov').setLabel('✅ Cargo Aprovado').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('set_rec_cargo_rem').setLabel('❌ Cargo a Remover').setStyle(ButtonStyle.Danger)
            );

            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('modal_editar_texto').setLabel('✏️ Alterar Título/Descrição').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_editar_banner').setLabel('🖼️ Banner Central').setStyle(ButtonStyle.Secondary)
            );

            const row4 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('modal_editar_banner_aprov').setLabel('🟢 Foto Aprovado').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('modal_editar_banner_reprov').setLabel('🔴 Foto Reprovado').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('voltar_cfg').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
            );

            return interaction.update({ embeds: [embedDef], components: [row1, row2, row3, row4] });
        }

        if (interaction.customId === 'set_rec_cat') {
            const select = new ChannelSelectMenuBuilder().setCustomId('select_rec_cat').setChannelTypes([ChannelType.GuildCategory]).setPlaceholder('Selecione a categoria');
            return interaction.reply({ content: '📁 Selecione a **Categoria** onde os canais de recrutamento serão criados:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        }
        if (interaction.customId === 'set_rec_log') {
            const select = new ChannelSelectMenuBuilder().setCustomId('select_rec_log').setChannelTypes([ChannelType.GuildText]).setPlaceholder('Selecione o canal de relatórios');
            return interaction.reply({ content: '📡 Selecione o canal de **Relatórios/Logs** para a staff:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        }
        if (interaction.customId === 'set_rec_anuncio') {
            const select = new ChannelSelectMenuBuilder().setCustomId('select_rec_anuncio').setChannelTypes([ChannelType.GuildText]).setPlaceholder('Selecione o canal de anúncios');
            return interaction.reply({ content: '📢 Selecione o canal de **Anúncios de Aprovados/Reprovados**:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        }
        if (interaction.customId === 'set_rec_cargo_aprov') {
            const select = new RoleSelectMenuBuilder().setCustomId('select_rec_cargo_aprov').setPlaceholder('Selecione o cargo de aprovado');
            return interaction.reply({ content: '✅ Selecione o cargo que será **adicionado** ao aprovar o membro:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        }
        if (interaction.customId === 'set_rec_cargo_rem') {
            const select = new RoleSelectMenuBuilder().setCustomId('select_rec_cargo_rem').setPlaceholder('Selecione o cargo a remover');
            return interaction.reply({ content: '❌ Selecione o cargo (ex: Visitante) que será **removido** ao aprovar:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        }

        if (interaction.customId === 'modal_editar_texto') {
            const modal = new ModalBuilder().setCustomId('modal_save_texto').setTitle('Editar Textos do Painel');
            const inputTitulo = new TextInputBuilder().setCustomId('txt_titulo').setLabel('Título do Painel').setStyle(TextInputStyle.Short).setRequired(true);
            const inputDesc = new TextInputBuilder().setCustomId('txt_desc').setLabel('Descrição Principal').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(
                new ActionRowBuilder().addComponents(inputTitulo),
                new ActionRowBuilder().addComponents(inputDesc)
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'modal_editar_banner') {
            const modal = new ModalBuilder().setCustomId('modal_save_banner').setTitle('Alterar Banner da Central');
            const inputBanner = new TextInputBuilder().setCustomId('txt_banner').setLabel('Link da Imagem/GIF/Vídeo').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(inputBanner));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'modal_editar_banner_aprov') {
            const modal = new ModalBuilder().setCustomId('modal_save_aprov').setTitle('Alterar Foto de Aprovado');
            const inputBanner = new TextInputBuilder().setCustomId('txt_aprov').setLabel('Link da Imagem de Aprovado').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(inputBanner));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'modal_editar_banner_reprov') {
            const modal = new ModalBuilder().setCustomId('modal_save_reprov').setTitle('Alterar Foto de Reprovado');
            const inputBanner = new TextInputBuilder().setCustomId('txt_reprov').setLabel('Link da Imagem de Reprovado').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(inputBanner));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'cfg_gerenciar_perguntas') {
            const perguntas = (await getData(db, `rec_perguntas_${guildId}`)) || [];
            const embed = new EmbedBuilder()
                .setColor('#111214')
                .setTitle('❓ Gerenciar Perguntas')
                .setDescription(`Controle as perguntas utilizadas no formulário.\n\n**Total cadastradas:** ${perguntas.length}/20\n\n` + (perguntas.length === 0 ? 'Nenhuma pergunta cadastrada.' : perguntas.map((p, i) => `**${i+1}.** ${p}`).join('\n')));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('add_pergunta_modal').setLabel('Adicionar').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
                new ButtonBuilder().setCustomId('del_pergunta').setLabel('Remover última').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
                new ButtonBuilder().setCustomId('voltar_cfg').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('↩️')
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.customId === 'add_pergunta_modal') {
            const modal = new ModalBuilder().setCustomId('modal_add_pergunta').setTitle('Adicionar Pergunta');
            const input = new TextInputBuilder().setCustomId('texto_pergunta').setLabel('Texto da Pergunta').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'del_pergunta') {
            let perguntas = (await getData(db, `rec_perguntas_${guildId}`)) || [];
            if (perguntas.length > 0) {
                perguntas.pop();
                await setData(db, `rec_perguntas_${guildId}`, perguntas);
            }
            return interaction.reply({ content: '✅ Última pergunta removida!', ephemeral: true });
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_dados_candidato') {
        const nomeRp = interaction.fields.getTextInputValue('cad_nome');
        const idRp = interaction.fields.getTextInputValue('cad_id');
        const idadeRp = interaction.fields.getTextInputValue('cad_idade');
        const tempoRp = interaction.fields.getTextInputValue('cad_tempogta');
        const dispRp = interaction.fields.getTextInputValue('cad_disp');

        const perguntas = (await getData(db, `rec_perguntas_${guildId}`)) || [];
        await interaction.deferReply({ ephemeral: true });

        const categoriaId = await getData(db, `rec_categoria_${guildId}`);
        const guild = interaction.guild;

        const channel = await guild.channels.create({
            name: `recrutamento-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: categoriaId || null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ]
        });

        const sessao = {
            userId: interaction.user.id,
            channelId: channel.id,
            dadosIniciais: { nomeRp, idRp, idadeRp, tempoRp, dispRp },
            perguntaIndex: 0,
            respostas: []
        };
        await setData(db, `rec_sessao_${interaction.user.id}`, sessao);

        const embedPergunta = new EmbedBuilder()
            .setColor('#111214')
            .setTitle('📋 Recrutamento Iniciado')
            .setDescription(`**DADOS INFORMADOS:**\n• **Nome no RP:** ${nomeRp}\n• **ID:** ${idRp}\n• **Idade:** ${idadeRp}\n• **Tempo de RP:** ${tempoRp}\n• **Disponibilidade diária:** ${dispRp}\n\nResponda às perguntas abaixo com atenção.\n\n### 📝 Pergunta 1\n| ${perguntas[0]}`)
            .addFields({
                name: '📊 Progresso',
                value: `**Pergunta:** 1/${perguntas.length}\n**Status:** Em andamento`
            })
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setFooter({ text: 'Recrutamento privado • Responda com atenção.' });

        const rowFinalizar = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_cancelar_rec').setLabel('Finalizar Recrutamento').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embedPergunta], components: [rowFinalizar] });
        return interaction.editReply({ content: `✅ Canal privado de recrutamento criado com sucesso: <#${channel.id}>` });
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_add_pergunta') {
            const texto = interaction.fields.getTextInputValue('texto_pergunta');
            let perguntas = (await getData(db, `rec_perguntas_${guildId}`)) || [];
            if (perguntas.length < 20) {
                perguntas.push(texto);
                await setData(db, `rec_perguntas_${guildId}`, perguntas);
            }
            return interaction.reply({ content: '✅ Pergunta adicionada com sucesso!', ephemeral: true });
        }
        if (interaction.customId === 'modal_save_texto') {
            const titulo = interaction.fields.getTextInputValue('txt_titulo');
            const desc = interaction.fields.getTextInputValue('txt_desc');
            await setData(db, `rec_titulo_${guildId}`, titulo);
            await setData(db, `rec_desc_${guildId}`, desc);
            return interaction.reply({ content: '✅ Título e descrição atualizados com sucesso!', ephemeral: true });
        }
        if (interaction.customId === 'modal_save_banner') {
            const banner = interaction.fields.getTextInputValue('txt_banner');
            await setData(db, `rec_banner_${guildId}`, banner);
            return interaction.reply({ content: '✅ Banner central atualizado com sucesso!', ephemeral: true });
        }
        if (interaction.customId === 'modal_save_aprov') {
            const banner = interaction.fields.getTextInputValue('txt_aprov');
            await setData(db, `rec_banner_aprov_${guildId}`, banner);
            return interaction.reply({ content: '✅ Foto de Aprovado atualizada com sucesso!', ephemeral: true });
        }
        if (interaction.customId === 'modal_save_reprov') {
            const banner = interaction.fields.getTextInputValue('txt_reprov');
            await setData(db, `rec_banner_reprov_${guildId}`, banner);
            return interaction.reply({ content: '✅ Foto de Reprovado atualizada com sucesso!', ephemeral: true });
        }
    }

    if (interaction.isChannelSelectMenu()) {
        const id = interaction.values[0];
        if (interaction.customId === 'select_rec_cat') {
            await setData(db, `rec_categoria_${guildId}`, id);
            return interaction.update({ content: `✅ Categoria configurada para <#${id}>!`, components: [] });
        }
        if (interaction.customId === 'select_rec_log') {
            await setData(db, `rec_canal_relatorios_${guildId}`, id);
            return interaction.update({ content: `✅ Canal de relatórios configurado para <#${id}>!`, components: [] });
        }
        if (interaction.customId === 'select_rec_anuncio') {
            await setData(db, `rec_canal_anuncio_${guildId}`, id);
            return interaction.update({ content: `✅ Canal de anúncios configurado para <#${id}>!`, components: [] });
        }
    }

    if (interaction.isRoleSelectMenu()) {
        const id = interaction.values[0];
        if (interaction.customId === 'select_rec_cargo_aprov') {
            await setData(db, `rec_cargo_aprovado_${guildId}`, id);
            return interaction.update({ content: `✅ Cargo de aprovado configurado para <@&${id}>!`, components: [] });
        }
        if (interaction.customId === 'select_rec_cargo_rem') {
            await setData(db, `rec_cargo_remover_${guildId}`, id);
            return interaction.update({ content: `✅ Cargo a remover configurado para <@&${id}>!`, components: [] });
        }
    }

    if (interaction.isButton() && (interaction.customId.startsWith('rec_aprovar_') || interaction.customId.startsWith('rec_reprovar_'))) {
        const partes = interaction.customId.split('_');
        const acao = partes[1];
        const candidatoId = partes[2];
        const guild = interaction.guild;

        const candidato = await guild.members.fetch(candidatoId).catch(() => null);
        const cargoAprovadoId = await getData(db, `rec_cargo_aprovado_${guildId}`);
        const cargoRemoverId = await getData(db, `rec_cargo_remover_${guildId}`);
        
        const canalAnuncioId = await getData(db, `rec_canal_anuncio_${guildId}`);
        const canalRelatorioId = await getData(db, `rec_canal_relatorios_${guildId}`);
        
        const canalAnuncio = (canalAnuncioId ? guild.channels.cache.get(canalAnuncioId) : null) || interaction.channel;
        const canalRelatorios = canalRelatorioId ? guild.channels.cache.get(canalRelatorioId) : null;

        if (acao === 'aprovar') {
            if (candidato) {
                if (cargoAprovadoId) await candidato.roles.add(cargoAprovadoId).catch(() => {});
                if (cargoRemoverId) await candidato.roles.remove(cargoRemoverId).catch(() => {});
            }

            const bannerAprovado = (await getData(db, `rec_banner_aprov_${guildId}`)) || 'https://images.contentstack.io/v3/assets/bltb6530b271fca0b16/blt6d9e03d40e1f7c78/aprovado_banner.png';

            const embedAprovado = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('✅ | FORMULÁRIO APROVADO')
                .setDescription(`Parabéns <@${candidatoId}>, você foi **APROVADO** no processo seletivo.`)
                .addFields(
                    { name: `> 👤 Aprovado:`, value: `<@${candidatoId}>`, inline: false },
                    { name: `> 👮 Instrutor:`, value: `<@${interaction.user.id}>`, inline: false },
                    { name: '\u200b', value: '----------------------------------------', inline: false },
                    { name: '🎉 Seja bem-vindo à organização!', value: '\u200b', inline: false },
                    { name: `⏱️ Horário: ${formatarHorario()}`, value: '\u200b', inline: true },
                    { name: `📅 Data: ${formatarData()}`, value: '\u200b', inline: true }
                )
                .setImage(bannerAprovado);

            await interaction.message.edit({ components: [] }).catch(() => {});
            
            // 1. Canal de Anúncios: envia APENAS o embed limpo (sem texto com emoji por cima)
            await canalAnuncio.send({ embeds: [embedAprovado] }).catch(() => {});

            // 2. Canal de Logs da Staff: envia o texto informativo com o emoji e o embed para a staff ver quem avaliou
            if (canalRelatorios) {
                await canalRelatorios.send({ 
                    content: `🎉 O recrutamento de <@${candidatoId}> foi avaliado por <@${interaction.user.id}> e o candidato foi **APROVADO**!`, 
                    embeds: [embedAprovado] 
                }).catch(() => {});
            }

            return interaction.reply({ content: `✅ Candidato <@${candidatoId}> aprovado com sucesso!`, ephemeral: true });
        }

        if (acao === 'reprovar') {
            const modal = new ModalBuilder().setCustomId(`modal_reprovar_${candidatoId}`).setTitle('Motivo da Reprovação');
            const input = new TextInputBuilder().setCustomId('motivo_reprov').setLabel('Insira o motivo').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reprovar_')) {
        const candidatoId = interaction.customId.replace('modal_reprovar_', '');
        const motivo = interaction.fields.getTextInputValue('motivo_reprov');
        const guild = interaction.guild;
        const guildId = guild.id;

        const canalAnuncioId = await getData(db, `rec_canal_anuncio_${guildId}`);
        const canalRelatorioId = await getData(db, `rec_canal_relatorios_${guildId}`);
        
        const canalAnuncio = (canalAnuncioId ? guild.channels.cache.get(canalAnuncioId) : null) || interaction.channel;
        const canalRelatorios = canalRelatorioId ? guild.channels.cache.get(canalRelatorioId) : null;
        
        const bannerReprovado = (await getData(db, `rec_banner_reprov_${guildId}`)) || 'https://images.contentstack.io/v3/assets/bltb6530b271fca0b16/blt6d9e03d40e1f7c78/reprovado_banner.png';

        const embedReprovado = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('❌ | FORMULÁRIO REPROVADO')
            .setDescription(`Infelizmente <@${candidatoId}>, você foi **REPROVADO** no processo seletivo.`)
            .addFields(
                { name: `> 👮 Instrutor:`, value: `<@${interaction.user.id}>`, inline: false },
                { name: `> 📝 Motivo:`, value: motivo, inline: false },
                { name: '\u200b', value: '----------------------------------------', inline: false },
                { name: `⏱️ Horário: ${formatarHorario()}`, value: '\u200b', inline: true },
                { name: `📅 Data: ${formatarData()}`, value: '\u200b', inline: true }
            )
            .setImage(bannerReprovado);

        // 1. Canal de Anúncios: envia APENAS o embed limpo
        await canalAnuncio.send({ embeds: [embedReprovado] }).catch(() => {});

        // 2. Canal de Logs da Staff: envia o texto com o aviso e quem avaliou
        if (canalRelatorios) {
            await canalRelatorios.send({ 
                content: `❌ O recrutamento de <@${candidatoId}> foi avaliado por <@${interaction.user.id}> e o candidato foi **REPROVADO**!`, 
                embeds: [embedReprovado] 
            }).catch(() => {});
        }

        return interaction.reply({ content: `❌ Candidato <@${candidatoId}> reprovado com sucesso!`, ephemeral: true });
    }
}

async function handleRecrutamentoMessage(message, db) {
    if (message.author.bot || !message.guild) return false;

    const guildId = message.guild.id;
    const sessao = await getData(db, `rec_sessao_${message.author.id}`);

    if (!sessao || sessao.channelId !== message.channel.id) return false;

    const perguntas = (await getData(db, `rec_perguntas_${guildId}`)) || [];
    
    sessao.respostas.push({
        pergunta: perguntas[sessao.perguntaIndex],
        resposta: message.content
    });

    sessao.perguntaIndex++;

    if (sessao.perguntaIndex < perguntas.length) {
        await setData(db, `rec_sessao_${message.author.id}`, sessao);

        const embedProxima = new EmbedBuilder()
            .setColor('#111214')
            .setTitle(`📋 Pergunta ${sessao.perguntaIndex + 1}`)
            .setDescription(`| ${perguntas[sessao.perguntaIndex]}`)
            .addFields({
                name: '📊 Progresso',
                value: `**Pergunta:** ${sessao.perguntaIndex + 1}/${perguntas.length}\n**Status:** Em andamento`
            })
            .setThumbnail(message.guild.iconURL({ dynamic: true }))
            .setFooter({ text: 'Recrutamento privado • Responda com atenção.' });

        await message.channel.send({ embeds: [embedProxima] });
    } else {
        await db.collection('dados').deleteOne({ _id: `rec_sessao_${message.author.id}` });

        const canalRelatorioId = await getData(db, `rec_canal_relatorios_${guildId}`);
        const canalLogs = canalRelatorioId ? message.guild.channels.cache.get(canalRelatorioId) : null;

        const d = sessao.dadosIniciais;
        let infoDados = `**DADOS DO CANDIDATO:**\n• **Nome no RP:** ${d.nomeRp}\n• **ID:** ${d.idRp}\n• **Idade:** ${d.idadeRp}\n• **Tempo de RP:** ${d.tempoRp}\n• **Disponibilidade:** ${d.dispRp}\n\n`;
        let descRespostas = sessao.respostas.map((r, i) => `**❓ Pergunta ${i+1}**\n| ${r.pergunta}\n💬 ${r.resposta}\n`).join('\n');

        const embedRelatorio = new EmbedBuilder()
            .setColor('#111214')
            .setTitle('📋 Novo Recrutamento Concluído')
            .setDescription(`**Candidato:** <@${message.author.id}>\n\n${infoDados}${descRespostas}`)
            .addFields(
                { name: '📌 Status:', value: '⏳ Aguardando análise', inline: true },
                { name: '📝 Perguntas respondidas:', value: `${sessao.respostas.length}`, inline: true }
            )
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));

        const rowAnalise = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rec_aprovar_${message.author.id}`).setLabel('Aprovar').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`rec_reprovar_${message.author.id}`).setLabel('Reprovar').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );

        if (canalLogs) {
            await canalLogs.send({ embeds: [embedRelatorio], components: [rowAnalise] }).catch(() => {});
        } else {
            await message.channel.send({ embeds: [embedRelatorio], components: [rowAnalise] }).catch(() => {});
        }

        await message.channel.send('✅ **Formulário enviado com sucesso para a equipe!** Este canal será fechado em alguns segundos.');
        setTimeout(() => message.channel.delete().catch(() => {}), 5000);
    }

    return true;
}

module.exports = { 
    recrutamentoCommand, 
    configRecrutamentoCommand, 
    handleRecrutamentoInteraction, 
    handleRecrutamentoMessage 
};