
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    ChannelType,
    PermissionsBitField,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const ausenciaCommand = new SlashCommandBuilder()
    .setName('ausencia')
    .setDescription('Envia o painel da Central de Ausências no canal atual (Admin)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

const configAusenciaCommand = new SlashCommandBuilder()
    .setName('configausencia')
    .setDescription('Abre o painel de configuração do sistema de ausências (Admin)')
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
        { $set: { value } },
        { upsert: true }
    );
}

function formatarDataSimples(diasAdicionar = 0) {
    const data = new Date();
    data.setDate(data.getDate() + diasAdicionar);
    return data.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
    });
}

// Enviar painel público da Central de Ausências
async function enviarCentralAusencia(interaction, db) {
    const guildId = interaction.guild.id;

    const desc = (await getData(db, `aus_desc_${guildId}`)) ||
        'Sistema de controle de afastamentos da organização.\n\n' +
        '📌 **Como funciona**\n' +
        '> Registre uma ausência informando o período e motivo.\n' +
        '> A liderança poderá acompanhar os registros.';

    const bannerUrl = (await getData(db, `aus_banner_${guildId}`)) ||
        'https://images.contentstack.io/v3/assets/bltb6530b271fca0b16/blt6d9e03d40e1f7c78/ausencia_banner.png';

    const serverIconUrl = interaction.guild.iconURL({ dynamic: true });

    const embed = new EmbedBuilder()
        .setColor('#111214')
        .setImage(bannerUrl)
        .setDescription(desc)
        .setFooter({
            text: 'Organizações • Roleplay | Desenvolvido por lk'
        });

    if (serverIconUrl) embed.setThumbnail(serverIconUrl);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_iniciar_modal_aus')
            .setLabel('Justificar Ausência')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📅'),
        new ButtonBuilder()
            .setCustomId('btn_ver_minhas_aus')
            .setLabel('📋')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('config_aus_painel')
            .setLabel('⚙️')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.channel.send({
        embeds: [embed],
        components: [row]
    });

    await interaction.reply({
        content: '✅ Central de Ausências enviada com sucesso!',
        flags: [MessageFlags.Ephemeral]
    });
}

// Painel de configuração da staff
async function abrirPainelConfigAus(interaction, db) {
    const guildId = interaction.guild.id;

    const canalLogId = await getData(db, `aus_canal_${guildId}`);
    const canalAnuncioId = await getData(db, `aus_canal_anuncio_${guildId}`);
    const cargoRespId = await getData(db, `aus_cargo_${guildId}`);

    const embedCfg = new EmbedBuilder()
        .setColor('#111214')
        .setTitle('⚙️ Configuração de Ausência')
        .setDescription(
            'Configure quem poderá analisar as solicitações e para onde vão os registros.\n\n' +
            `📢 **Canal de Aprovação (Logs):** ${canalLogId ? `<#${canalLogId}>` : 'Não configurado'}\n` +
            `📢 **Canal de Anúncios:** ${canalAnuncioId ? `<#${canalAnuncioId}>` : 'Não configurado'}\n` +
            `👮 **Cargo Responsável:** ${cargoRespId ? `<@&${cargoRespId}>` : 'Não configurado'}`
        );

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('set_aus_canal')
            .setLabel('Canal de Aprovação')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('set_aus_anuncio')
            .setLabel('Canal de Anúncios')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('set_aus_cargo')
            .setLabel('Cargo Responsável')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('modal_editar_banner_aus')
            .setLabel('🖼️ Alterar Imagem/Vídeo Banner')
            .setStyle(ButtonStyle.Secondary)
    );

    const payload = {
        embeds: [embedCfg],
        components: [row1, row2],
        flags: [MessageFlags.Ephemeral]
    };

    if (!interaction.isRepliable()) return;

    if (interaction.deferred || interaction.replied) {
        return interaction.followUp(payload);
    }

    return interaction.reply(payload);
}

async function handleAusenciaInteraction(interaction, db) {
    const guildId = interaction.guild?.id;

    if (!guildId) return false;

    // Comandos slash
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ausencia') {
            await enviarCentralAusencia(interaction, db);
            return true;
        }

        if (interaction.commandName === 'configausencia') {
            await abrirPainelConfigAus(interaction, db);
            return true;
        }
    }

    // Botões
    if (interaction.isButton()) {
        if (interaction.customId === 'config_aus_painel') {
            return abrirPainelConfigAus(interaction, db);
        }

        if (interaction.customId === 'btn_iniciar_modal_aus') {
            const modal = new ModalBuilder()
                .setCustomId('modal_dados_ausencia')
                .setTitle('Registrar Ausência');

            const inputDias = new TextInputBuilder()
                .setCustomId('aus_dias')
                .setLabel('Quantidade de dias')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 5')
                .setRequired(true);

            const inputMotivo = new TextInputBuilder()
                .setCustomId('aus_motivo')
                .setLabel('Motivo da ausência')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Informe o motivo da ausência...')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(inputDias),
                new ActionRowBuilder().addComponents(inputMotivo)
            );

            return interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_ver_minhas_aus') {
            return interaction.reply({
                content:
                    '📋 Você ainda não possui nenhuma solicitação de ausência registrada.\n\n' +
                    'Clique em **Justificar Ausência** para enviar uma solicitação.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (interaction.customId === 'set_aus_canal') {
            const select = new ChannelSelectMenuBuilder()
                .setCustomId('select_aus_canal')
                .setChannelTypes([ChannelType.GuildText])
                .setPlaceholder('Selecione o canal de aprovação');

            return interaction.reply({
                content: '📢 Selecione o canal onde os pedidos de ausência serão enviados para a staff:',
                components: [new ActionRowBuilder().addComponents(select)],
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (interaction.customId === 'set_aus_anuncio') {
            const select = new ChannelSelectMenuBuilder()
                .setCustomId('select_aus_anuncio')
                .setChannelTypes([ChannelType.GuildText])
                .setPlaceholder('Selecione o canal de anúncios');

            return interaction.reply({
                content: '📢 Selecione o canal onde o resultado final (Aprovado/Reprovado) será anunciado:',
                components: [new ActionRowBuilder().addComponents(select)],
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (interaction.customId === 'set_aus_cargo') {
            const select = new RoleSelectMenuBuilder()
                .setCustomId('select_aus_cargo')
                .setPlaceholder('Selecione o cargo responsável');

            return interaction.reply({
                content: '👮 Selecione o cargo responsável pelas aprovações:',
                components: [new ActionRowBuilder().addComponents(select)],
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (interaction.customId === 'modal_editar_banner_aus') {
            const modal = new ModalBuilder()
                .setCustomId('modal_save_banner_aus')
                .setTitle('Alterar Banner de Ausência');

            const inputBanner = new TextInputBuilder()
                .setCustomId('txt_banner_aus')
                .setLabel('Link da Imagem, GIF ou Vídeo')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(inputBanner)
            );

            return interaction.showModal(modal);
        }
    }

    // Salvar banner
    if (
        interaction.isModalSubmit() &&
        interaction.customId === 'modal_save_banner_aus'
    ) {
        const banner = interaction.fields.getTextInputValue('txt_banner_aus');

        await setData(db, `aus_banner_${guildId}`, banner);

        return interaction.reply({
            content: '✅ Banner / Vídeo da central de ausência atualizado com sucesso!',
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Menus de seleção de canal
    if (interaction.isChannelSelectMenu()) {
        const id = interaction.values[0];

        if (interaction.customId === 'select_aus_canal') {
            await setData(db, `aus_canal_${guildId}`, id);

            return interaction.update({
                content: `✅ Canal de aprovação configurado para <#${id}>!`,
                components: []
            });
        }

        if (interaction.customId === 'select_aus_anuncio') {
            await setData(db, `aus_canal_anuncio_${guildId}`, id);

            return interaction.update({
                content: `✅ Canal de anúncios configurado para <#${id}>!`,
                components: []
            });
        }
    }

    // Menu de seleção de cargo
    if (
        interaction.isRoleSelectMenu() &&
        interaction.customId === 'select_aus_cargo'
    ) {
        const id = interaction.values[0];

        await setData(db, `aus_cargo_${guildId}`, id);

        return interaction.update({
            content: `✅ Cargo responsável configurado para <@&${id}>!`,
            components: []
        });
    }

    // Receber solicitação de ausência
    if (
        interaction.isModalSubmit() &&
        interaction.customId === 'modal_dados_ausencia'
    ) {
        const diasStr = interaction.fields.getTextInputValue('aus_dias').trim();
        const motivo = interaction.fields.getTextInputValue('aus_motivo').trim();
        const qtdDias = Math.max(1, Math.min(365, parseInt(diasStr, 10) || 1));

        const dataInicio = formatarDataSimples(0);
        const dataFim = formatarDataSimples(qtdDias - 1);

        const canalLogId = await getData(db, `aus_canal_${guildId}`);
        const cargoRespId = await getData(db, `aus_cargo_${guildId}`);

        const guild = interaction.guild;
        const canalLogs = canalLogId
            ? guild.channels.cache.get(canalLogId)
            : null;

        const embedSolicitacao = new EmbedBuilder()
            .setColor('#111214')
            .setTitle('📅 | Nova Solicitação de Ausência')
            .addFields(
                {
                    name: '👤 Usuário:',
                    value: `<@${interaction.user.id}>`,
                    inline: false
                },
                {
                    name: '👑 Responsável:',
                    value: cargoRespId ? `<@&${cargoRespId}>` : 'Não definido',
                    inline: false
                },
                {
                    name: '📅 Período',
                    value: `${dataInicio} até ${dataFim}`,
                    inline: false
                },
                {
                    name: '⏱️ Duração',
                    value: `${qtdDias} dias`,
                    inline: false
                },
                {
                    name: '📝 Motivo',
                    value: motivo.slice(0, 1024),
                    inline: false
                },
                {
                    name: '📌 Status:',
                    value: '⏳ Aguardando aprovação',
                    inline: false
                }
            )
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setFooter({
                text: 'Organizações • Roleplay | Desenvolvido por lk'
            });

        const rowAnalise = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `aus_aprovar_${interaction.user.id}_${qtdDias}_${dataInicio}_${dataFim}`
                )
                .setLabel('Aprovar')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`aus_reprovar_${interaction.user.id}`)
                .setLabel('Reprovar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        if (!canalLogs) {
            return interaction.reply({
                content: '❌ O canal de aprovação não está configurado ou não foi encontrado. Peça à staff para configurar o sistema.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await canalLogs.send({
            content: cargoRespId ? `<@&${cargoRespId}>` : '',
            embeds: [embedSolicitacao],
            components: [rowAnalise]
        });

        return interaction.reply({
            content: '✅ Sua solicitação de ausência foi enviada com sucesso para a liderança!',
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Aprovar ou iniciar reprovação
    if (
        interaction.isButton() &&
        (
            interaction.customId.startsWith('aus_aprovar_') ||
            interaction.customId.startsWith('aus_reprovar_')
        )
    ) {
        const partes = interaction.customId.split('_');
        const acao = partes[1];
        const solicitanteId = partes[2];

        if (acao === 'aprovar') {
            const guild = interaction.guild;

            const canalAnuncioId = await getData(db, `aus_canal_anuncio_${guildId}`);
            const canalAnuncio = (
                canalAnuncioId
                    ? guild.channels.cache.get(canalAnuncioId)
                    : null
            ) || interaction.channel;

            const bannerAusencia = (await getData(db, `aus_banner_${guildId}`)) ||
                'https://images.contentstack.io/v3/assets/bltb6530b271fca0b16/blt6d9e03d40e1f7c78/ausencia_banner.png';

            const qtdDias = partes[3];
            const dataInicio = partes[4];
            const dataFim = partes[5];

            const embedAprovado = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('✅ Ausência Aprovada')
                .addFields(
                    {
                        name: '👤 Usuário:',
                        value: `<@${solicitanteId}>`,
                        inline: false
                    },
                    {
                        name: '📅 Período:',
                        value: `${dataInicio} até ${dataFim}`,
                        inline: false
                    },
                    {
                        name: '⏱️ Duração:',
                        value: `${qtdDias} dias`,
                        inline: false
                    },
                    {
                        name: 'Status:',
                        value: '✅ Aprovada',
                        inline: false
                    },
                    {
                        name: '👑 Aprovado por:',
                        value: `<@${interaction.user.id}>`,
                        inline: false
                    }
                )
                .setImage(bannerAusencia)
                .setFooter({
                    text: 'Organizações • Roleplay | Desenvolvido por lk'
                });

            await interaction.deferReply({
                flags: [MessageFlags.Ephemeral]
            });

            try {
                await canalAnuncio.send({ embeds: [embedAprovado] });
                await interaction.message.edit({ components: [] });

                return interaction.editReply({
                    content: `✅ Ausência de <@${solicitanteId}> aprovada com sucesso!`
                });
            } catch (erro) {
                console.error('[Ausência] Erro ao aprovar:', erro);

                return interaction.editReply({
                    content: '❌ Não consegui concluir a aprovação. Confira as permissões do bot nos canais.'
                });
            }
        }

        if (acao === 'reprovar') {
            // Salva a mensagem que contém os botões para atualizar depois.
            await setData(db, `reprov_data_${interaction.user.id}`, {
                messageId: interaction.message.id,
                channelId: interaction.channel.id
            });

            const modal = new ModalBuilder()
                .setCustomId(`modal_reprovar_aus_${solicitanteId}`)
                .setTitle('Motivo da Reprovação');

            const input = new TextInputBuilder()
                .setCustomId('motivo_reprov_aus')
                .setLabel('Insira o motivo')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );

            return interaction.showModal(modal);
        }
    }

    // Receber o motivo da reprovação
    if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('modal_reprovar_aus_')
    ) {
        // Responde ao Discord imediatamente, evitando que o formulário expire.
        await interaction.deferReply({
            flags: [MessageFlags.Ephemeral]
        });

        try {
            const solicitanteId = interaction.customId.replace(
                'modal_reprovar_aus_',
                ''
            );

            const motivo = interaction.fields
                .getTextInputValue('motivo_reprov_aus')
                .trim();

            const guild = interaction.guild;

            if (!motivo) {
                return interaction.editReply({
                    content: '❌ Informe o motivo da reprovação.'
                });
            }

            const canalAnuncioId = await getData(
                db,
                `aus_canal_anuncio_${guildId}`
            );

            const canalAnuncio = (
                canalAnuncioId
                    ? guild.channels.cache.get(canalAnuncioId)
                    : null
            ) || interaction.channel;

            const bannerAusencia = (await getData(
                db,
                `aus_banner_${guildId}`
            )) || 'https://images.contentstack.io/v3/assets/bltb6530b271fca0b16/blt6d9e03d40e1f7c78/ausencia_banner.png';

            const embedReprovado = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle('❌ Ausência Reprovada')
                .addFields(
                    {
                        name: '👤 Usuário:',
                        value: `<@${solicitanteId}>`,
                        inline: false
                    },
                    {
                        name: '📝 Motivo:',
                        value: motivo.slice(0, 1024),
                        inline: false
                    },
                    {
                        name: 'Status:',
                        value: '❌ Reprovada',
                        inline: false
                    },
                    {
                        name: '👑 Reprovado por:',
                        value: `<@${interaction.user.id}>`,
                        inline: false
                    }
                )
                .setImage(bannerAusencia)
                .setFooter({
                    text: 'Organizações • Roleplay | Desenvolvido por lk'
                });

            // Publica o resultado no canal configurado.
            await canalAnuncio.send({
                embeds: [embedReprovado]
            });

            // Tenta remover os botões da solicitação original.
            const dadosReprov = await getData(
                db,
                `reprov_data_${interaction.user.id}`
            );

            if (dadosReprov) {
                try {
                    const canalOriginal =
                        guild.channels.cache.get(dadosReprov.channelId) ||
                        await guild.channels.fetch(dadosReprov.channelId);

                    if (canalOriginal && canalOriginal.isTextBased()) {
                        const msgOriginal = await canalOriginal.messages.fetch(
                            dadosReprov.messageId
                        );

                        await msgOriginal.edit({
                            components: []
                        });
                    }
                } catch (erroMensagem) {
                    console.error(
                        '[Ausência] Não foi possível atualizar a mensagem original:',
                        erroMensagem
                    );
                }
            }

            await interaction.editReply({
                content: `❌ Ausência de <@${solicitanteId}> reprovada com sucesso!`
            });

            return true;
        } catch (erro) {
            console.error(
                '[Ausência] Erro ao reprovar solicitação:',
                erro
            );

            return interaction.editReply({
                content: '❌ Não consegui concluir a reprovação. Verifique as permissões do bot no canal de anúncios e confira o console do bot.'
            });
        }
    }

    return false;
}

module.exports = {
    ausenciaCommand,
    configAusenciaCommand,
    handleAusenciaInteraction
};