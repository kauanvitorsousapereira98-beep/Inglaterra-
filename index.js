mconst http = require('http');
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online!');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor HTTP rodando na porta ${PORT}`);
});

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const { MongoClient } = require('mongodb');

const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;

async function conectarBanco() {
    try {
        await mongoClient.connect();
        db = mongoClient.db('discord_bot_db');
        console.log('✅ Conectado ao MongoDB nativo com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao conectar ao MongoDB:', error);
    }
}
conectarBanco();

// --- IMPORTAÇÕES DOS MÓDULOS ---
const { createEmbedPanel } = require('./embedPanel.js');
const { getTitleModal, getDescModal, getColorModal, getAuthorModal, getImagesModal, getFooterModal, getFieldModal } = require('./embedModals.js');
const { punirCommand, handlePunicoesInteraction, handlePunicoesMessage, verificarPunionsPendentesAoIniciar } = require('./punicoes.js');
const { handleVerificacaoInteraction } = require('./verificacao.js');
const { recrutamentoCommand, configRecrutamentoCommand, handleRecrutamentoInteraction, handleRecrutamentoMessage } = require('./recrutamento.js');
const { ausenciaCommand, configAusenciaCommand, handleAusenciaInteraction } = require('./ausencia.js');
const { batePontoCommand, painelBatePontoCommand, handleBatePontoInteraction } = require('./bateponto.js');

const TOKEN = process.env.DISCORD_TOKEN || '';
const PREFIX = '.';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

async function getData(key) {
    if (!db) return null;
    const doc = await db.collection('dados').findOne({ _id: key });
    return doc ? doc.value : null;
}

async function setData(key, value) {
    if (!db) return;
    await db.collection('dados').updateOne(
        { _id: key },
        { $set: { value: value } },
        { upsert: true }
    );
}

client.once('ready', async () => {
    console.log(`✅ Bot profissional online como: ${client.user.tag}`);
    client.user.setActivity('🏆 𝙧𝙖𝙣𝙠𝙞𝙣𝙜 𝙜𝙡𝙤𝙗𝙖𝙡 (.𝙩op)', { type: 3 });

    try {
        verificarPunionsPendentesAoIniciar(client, db);
    } catch (err) {
        console.error('Aviso na verificação de punições pendentes:', err);
    }

    const slashEmbed = new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Abre o painel interativo de criação de embeds');

    const criarCanalBatePontoCmd = new SlashCommandBuilder()
        .setName('criarcanalbateponto')
        .setDescription('Cria o canal ⏱️・ʙᴀᴛᴇ-ᴘᴏɴᴛᴏ e envia o painel (Admin)');

    const commands = [
        new SlashCommandBuilder()
            .setName('painel')
            .setDescription('Abre o painel de gerenciamento do bot'),
        new SlashCommandBuilder()
            .setName('verificacao')
            .setDescription('Envia o painel de verificação no canal atual (Admin)'),
        criarCanalBatePontoCmd,
        batePontoCommand,
        painelBatePontoCommand,
        recrutamentoCommand,
        configRecrutamentoCommand,
        ausenciaCommand,
        configAusenciaCommand,
        slashEmbed,
        punirCommand
    ].map(command => command?.toJSON()).filter(Boolean);

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        for (const [guildId] of client.guilds.cache) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: commands },
            );
        }
        console.log('✅ Comandos slash registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos slash:', error);
    }
});

async function enviarPainel(autor, membro, guild, interactionObj) {
    const cargosPainel = (await getData(`cargos_painel_${guild.id}`)) || [];
    const isAdmin = membro.permissions.has(PermissionsBitField.Flags.Administrator);
    const isOwner = guild.ownerId === autor.id;
    const temCargoPainel = cargosPainel.length === 0 ? true : cargosPainel.some(id => membro.roles.cache.has(id));

    if (!isAdmin && !isOwner && !temCargoPainel) {
        const payload = { content: '❌ 𝙑𝙤𝙘ê 𝙣ã𝙤 𝙩𝙚𝙢 𝙥𝙚𝙧𝙢𝙞𝙨𝙨ã𝙤 𝙥𝙖𝙧𝙖 𝙖𝙗𝙧𝙞𝙧 𝙤 𝙥𝙖𝙞𝙣𝙚𝙡 𝙙𝙚 𝙘𝙤𝙣𝙛𝙞𝙜𝙪𝙧𝙖çã𝙤!', flags: [MessageFlags.Ephemeral] };
        if (interactionObj.deferred || interactionObj.replied) {
            return interactionObj.followUp(payload);
        }
        return interactionObj.reply(payload);
    }

    const metas = (await getData(`metas_lista_${guild.id}`)) || [];
    metas.sort((a, b) => a.pontos - b.pontos);
    let metasTexto = metas.length === 0 ? 'Nenhuma meta cadastrada' : metas.map(m => `• **${m.pontos} pts** ➔ <@&${m.cargoId}>`).join('\n');
    
    const canalLogId = await getData(`canal_log_${guild.id}`);
    const canalAvisoId = await getData(`canal_aviso_${guild.id}`);
    const canalPunicaoId = await getData(`canal_log_punicao_${guild.id}`);
    const canalAvisosPunicaoId = await getData(`canal_avisos_punicao_${guild.id}`);
    const cargoVerificadoId = await getData(`cargo_verificado_${guild.id}`);
    
    const infoCanais = `📢 **Canal de Avisos:** ${canalAvisoId ? `<#${canalAvisoId}>` : 'Não configurado'}\n` +
                       `📋 **Canal de Logs (Pontos):** ${canalLogId ? `<#${canalLogId}>` : 'Não configurado'}\n` +
                       `🚨 **Canal de Logs (Punições):** ${canalPunicaoId ? `<#${canalPunicaoId}>` : 'Não configurado'}\n` +
                       `📢 **Canal Avisos Punição (Público):** ${canalAvisosPunicaoId ? `<#${canalAvisosPunicaoId}>` : 'Não configurado'}\n` +
                       `🛡️ **Cargo de Verificação:** ${cargoVerificadoId ? `<@&${cargoVerificadoId}>` : 'Não configurado'}\n\n`;

    const embedPainel = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🖥️ 𝙋𝙖𝙞𝙣𝙚𝙡 𝙙𝙚 𝙂𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙢𝙚𝙣𝙩𝙤')
        .setDescription(`📁 **𝘽𝙚𝙢-𝙫𝙞𝙣𝙙𝙤 𝙖𝙤 𝙥𝙖𝙞𝙣𝙚𝙡!**\n\n${infoCanais}🎯 **Metas Cadastradas:**\n${metasTexto}\n\n# 𝙀𝙨𝙘𝙤𝙡𝙝𝙖 𝙖𝙗𝙖𝙞𝙭𝙤 𝙤 𝙦𝙪𝙚 𝙙𝙚𝙨𝙚𝙟𝙖 𝙜𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙧:`);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gerenciar_pontos').setLabel('⚡ Cargos de Pontos').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('gerenciar_rank').setLabel('🏆 Cargos de Rank').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('gerenciar_painel').setLabel('🛡️ Cargos de Painel').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gerenciar_metas').setLabel('🎯 Gerenciar Metas').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('config_canais').setLabel('📺 Configurar Canais').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('gerenciar_cargos_adv').setLabel('🛡️ Cargos de Punição (ADV)').setStyle(ButtonStyle.Danger)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('config_verificacao').setLabel('✅ Configurar Verificação').setStyle(ButtonStyle.Success)
    );

    const payload = { embeds: [embedPainel], components: [row1, row2, row3], flags: [MessageFlags.Ephemeral] };
    if (interactionObj.deferred || interactionObj.replied) {
        return interactionObj.followUp(payload);
    }
    return interactionObj.reply(payload);
}

async function registrarLog(guild, embed) {
    try {
        const canalLogId = await getData(`canal_log_${guild.id}`);
        let canalLog = null;
        if (canalLogId) {
            canalLog = guild.channels.cache.get(canalLogId);
        }
        if (!canalLog) {
            canalLog = guild.channels.cache.find(c => c.name.includes('logs-pontos') || c.name.includes('log'));
        }
        if (canalLog) {
            await canalLog.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('Aviso: Não foi possível enviar o log.');
    }
}

async function enviarAvisoMeta(guild, messageObj, embed) {
    try {
        const canalAvisoId = await getData(`canal_aviso_${guild.id}`);
        if (canalAvisoId) {
            const canalAviso = guild.channels.cache.get(canalAvisoId);
            if (canalAviso) {
                return await canalAviso.send({ embeds: [embed] });
            }
        }
        return await messageObj.reply({ embeds: [embed] });
    } catch (e) {
        return await messageObj.reply({ embeds: [embed] });
    }
}

client.on('interactionCreate', async (interaction) => {
    try {
        if (db && await handleRecrutamentoInteraction(interaction, db)) return;
        if (db && await handleAusenciaInteraction(interaction, db)) return;
        if (db && await handleVerificacaoInteraction(interaction, db)) return;
        if (db && await handleBatePontoInteraction(interaction, db)) return;

        if (interaction.isChatInputCommand() && interaction.commandName === 'criarcanalbateponto') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Precisas de ser Administrador para usar este comando!', flags: [MessageFlags.Ephemeral] });
            }

            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            try {
                const novoCanal = await interaction.guild.channels.create({
                    name: '⏱️・ʙᴀᴛᴇ-ᴘᴏɴᴛᴏ',
                    type: ChannelType.GuildText,
                    topic: 'Canal oficial de Bate-Ponto da organização.'
                });

                const embedBatePonto = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`Sistema de Bate Ponto | ${interaction.guild.name}`)
                    .setDescription('📥 | Clique em **ABRIR PONTO** para começar seu ponto.\n\n📤 | Clique em **ENCERRAR PONTO** para encerrar seu ponto.')
                    .setFooter({ text: 'Todos os direitos reservados.' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bp_abrir_ponto').setLabel('Abrir Ponto').setStyle(ButtonStyle.Success).setEmoji('📥'),
                    new ButtonBuilder().setCustomId('bp_encerrar_ponto').setLabel('Encerrar Ponto').setStyle(ButtonStyle.Danger).setEmoji('📤'),
                    new ButtonBuilder().setCustomId('bp_ver_lista').setLabel('Ver Lista').setStyle(ButtonStyle.Primary).setEmoji('📋')
                );

                await novoCanal.send({ embeds: [embedBatePonto], components: [row] });

                return interaction.editReply(`✅ Canal ${novoCanal} criado com sucesso e painel enviado lá dentro!`);
            } catch (err) {
                console.error(err);
                return interaction.editReply('❌ Ocorreu um erro ao criar o canal.');
            }
        }

        if (
            (interaction.isChatInputCommand() && interaction.commandName === 'punicoes') ||
            (interaction.isButton() && interaction.customId.startsWith('pun_')) ||
            (interaction.isUserSelectMenu() && interaction.customId === 'select_membro_punido') ||
            (interaction.isRoleSelectMenu() && interaction.customId === 'select_cargo_punicao') ||
            (interaction.isStringSelectMenu() && interaction.customId === 'select_tipo_punicao') ||
            (interaction.isModalSubmit() && interaction.customId.startsWith('modal_pun_'))
        ) {
            await handlePunicoesInteraction(interaction, db);
            return;
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'embed') {
            await setData(`embed_temp_${interaction.user.id}`, {});
            const panel = createEmbedPanel({});
            return await interaction.reply({ ...panel, flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.isButton() && [
            'btn_author', 'btn_title', 'btn_desc', 'btn_color', 
            'btn_images', 'btn_footer', 'btn_fields', 'btn_send_fast', 'btn_send_custom', 'btn_reset'
        ].includes(interaction.customId)) {
            const embedData = (await getData(`embed_temp_${interaction.user.id}`)) || {};

            if (interaction.customId === 'btn_title') return interaction.showModal(getTitleModal(embedData));
            if (interaction.customId === 'btn_desc') return interaction.showModal(getDescModal(embedData.description));
            if (interaction.customId === 'btn_color') {
                const selectColor = new StringSelectMenuBuilder()
                    .setCustomId('select_embed_color_preset')
                    .setPlaceholder('Selecione uma cor')
                    .addOptions([
                        { label: 'Nova Cor (HEX Personalizado)', description: 'Insira um código HEX personalizado', value: 'custom_hex', emoji: '➕' },
                        { label: 'Vermelho Clássico', description: '#E74C3C', value: '#E74C3C' },
                        { label: 'Branco', description: '#FFFFFF', value: '#FFFFFF' },
                        { label: 'Neutro', description: '#36393F', value: '#36393F' },
                        { label: 'Azul Clássico', description: '#3498DB', value: '#3498DB' },
                        { label: 'Azul Discord', description: '#5865F2', value: '#5865F2' },
                        { label: 'Azul Escuro', description: '#206694', value: '#206694' },
                        { label: 'Verde Clássico', description: '#2ECC71', value: '#2ECC71' }
                    ]);
                const row = new ActionRowBuilder().addComponents(selectColor);
                return interaction.reply({ content: '🎨 **Selecione uma cor** para o seu embed:', components: [row], flags: [MessageFlags.Ephemeral] });
            }
            if (interaction.customId === 'btn_author') return interaction.showModal(getAuthorModal(embedData.author));
            if (interaction.customId === 'btn_images') return interaction.showModal(getImagesModal(embedData));
            if (interaction.customId === 'btn_footer') return interaction.showModal(getFooterModal(embedData.footer));
            if (interaction.customId === 'btn_fields') return interaction.showModal(getFieldModal());
            if (interaction.customId === 'btn_reset') {
                await setData(`embed_temp_${interaction.user.id}`, {});
                const panel = createEmbedPanel({});
                return interaction.update(panel);
            }
            if (interaction.customId === 'btn_send_fast' || interaction.customId === 'btn_send_custom') {
                const channelSelect = new ChannelSelectMenuBuilder()
                    .setCustomId('select_canal_enviar_embed')
                    .setChannelTypes([ChannelType.GuildText])
                    .setPlaceholder('Selecione onde enviar o embed');
                const row = new ActionRowBuilder().addComponents(channelSelect);
                return interaction.reply({ content: '📤 Selecione abaixo o canal onde deseja enviar este embed:', components: [row], flags: [MessageFlags.Ephemeral] });
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_embed_color_preset') {
            const escolha = interaction.values[0];
            if (escolha === 'custom_hex') {
                const embedData = (await getData(`embed_temp_${interaction.user.id}`)) || {};
                return interaction.showModal(getColorModal(embedData.color));
            }

            let embedData = (await getData(`embed_temp_${interaction.user.id}`)) || {};
            embedData.color = escolha;
            await setData(`embed_temp_${interaction.user.id}`, embedData);

            const updatedPanel = createEmbedPanel(embedData);
            return interaction.update(updatedPanel);
        }

        if (interaction.isModalSubmit() && ['modal_title', 'modal_desc', 'modal_color', 'modal_author', 'modal_images', 'modal_footer', 'modal_field'].includes(interaction.customId)) {
            let embedData = (await getData(`embed_temp_${interaction.user.id}`)) || {};

            if (interaction.customId === 'modal_title') {
                embedData.title = interaction.fields.getTextInputValue('embed_title');
                embedData.titleUrl = interaction.fields.getTextInputValue('embed_title_url') || null;
            } else if (interaction.customId === 'modal_desc') {
                embedData.description = interaction.fields.getTextInputValue('embed_desc');
            } else if (interaction.customId === 'modal_color') {
                embedData.color = interaction.fields.getTextInputValue('embed_color');
            } else if (interaction.customId === 'modal_author') {
                embedData.author = {
                    name: interaction.fields.getTextInputValue('author_name'),
                    iconURL: interaction.fields.getTextInputValue('author_icon') || null,
                    url: interaction.fields.getTextInputValue('author_url') || null
                };
            } else if (interaction.customId === 'modal_images') {
                embedData.image = interaction.fields.getTextInputValue('embed_image') || null;
                embedData.thumbnail = interaction.fields.getTextInputValue('embed_thumbnail') || null;
            } else if (interaction.customId === 'modal_footer') {
                embedData.footer = {
                    text: interaction.fields.getTextInputValue('footer_text'),
                    iconURL: interaction.fields.getTextInputValue('footer_icon') || null
                };
            } else if (interaction.customId === 'modal_field') {
                if (!embedData.fields) embedData.fields = [];
                embedData.fields.push({
                    name: interaction.fields.getTextInputValue('field_name'),
                    value: interaction.fields.getTextInputValue('field_value'),
                    inline: false
                });
            }

            await setData(`embed_temp_${interaction.user.id}`, embedData);
            const updatedPanel = createEmbedPanel(embedData);
            return interaction.update(updatedPanel);
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'select_canal_enviar_embed') {
            const channelId = interaction.values[0];
            const targetChannel = interaction.guild.channels.cache.get(channelId);
            const embedData = (await getData(`embed_temp_${interaction.user.id}`)) || {};

            const finalEmbed = new EmbedBuilder();
            if (embedData.title) {
                if (embedData.titleUrl) {
                    finalEmbed.setTitle(embedData.title).setURL(embedData.titleUrl);
                } else {
                    finalEmbed.setTitle(embedData.title);
                }
            }
            if (embedData.description) finalEmbed.setDescription(embedData.description);
            if (embedData.color) finalEmbed.setColor(embedData.color);
            if (embedData.author && embedData.author.name) finalEmbed.setAuthor(embedData.author);
            if (embedData.footer && embedData.footer.text) finalEmbed.setFooter(embedData.footer);
            if (embedData.image) finalEmbed.setImage(embedData.image);
            if (embedData.thumbnail) finalEmbed.setThumbnail(embedData.thumbnail);
            if (embedData.fields) finalEmbed.addFields(embedData.fields);

            if (targetChannel) {
                await targetChannel.send({ embeds: [finalEmbed] });
                return interaction.update({ content: `✅ Embed enviado com sucesso para <#${channelId}>!`, components: [] });
            }
            return interaction.update({ content: '❌ Canal não encontrado.', components: [] });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
            await enviarPainel(interaction.user, interaction.member, interaction.guild, interaction);
            return;
        }

        if (interaction.isButton()) {
            const guildId = interaction.guild.id;

            if (interaction.customId === 'gerenciar_cargos_adv') {
                const adv1Id = await getData(`cargo_punicao_${guildId}_ADV 1`);
                const adv2Id = await getData(`cargo_punicao_${guildId}_ADV 2`);
                const adv3Id = await getData(`cargo_punicao_${guildId}_ADV 3`);
                const banId = await getData(`cargo_punicao_${guildId}_Banimento`);

                const adv1 = adv1Id ? `<@&${adv1Id}>` : 'Não configurado';
                const adv2 = adv2Id ? `<@&${adv2Id}>` : 'Não configurado';
                const adv3 = adv3Id ? `<@&${adv3Id}>` : 'Não configurado';
                const ban = banId ? `<@&${banId}>` : 'Não configurado';

                const embedAdv = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('🛡️ 𝙠𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙢𝙚𝙣𝙩𝙤 𝙙𝙚 𝘾𝙖𝙧𝙜𝙤𝙨 𝙙𝙚 𝙋𝙪𝙣𝙞çã𝙤 (ADV)')
                    .setDescription('Clique nos botões abaixo para definir qual cargo automático será vinculado em cada punição:\n\n' +
                                    `• **ADV 1:** ${adv1}\n` +
                                    `• **ADV 2:** ${adv2}\n` +
                                    `• **ADV 3:** ${adv3}\n` +
                                    `• **Banimento:** ${ban}`);

                const rowAdv1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('adv_cfg_1').setLabel('Cargo ADV 1').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('adv_cfg_2').setLabel('Cargo ADV 2').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('adv_cfg_3').setLabel('Cargo ADV 3').setStyle(ButtonStyle.Secondary)
                );

                const rowAdv2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('adv_cfg_ban').setLabel('Cargo Banimento').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('voltar_painel').setLabel('🔙 Voltar').setStyle(ButtonStyle.Primary)
                );

                return interaction.update({ embeds: [embedAdv], components: [rowAdv1, rowAdv2] });
            }

            if (interaction.customId.startsWith('adv_cfg_')) {
                const tipoMap = {
                    'adv_cfg_1': 'ADV 1',
                    'adv_cfg_2': 'ADV 2',
                    'adv_cfg_3': 'ADV 3',
                    'adv_cfg_ban': 'Banimento'
                };
                const tipoSelecionado = tipoMap[interaction.customId];

                const selectRole = new RoleSelectMenuBuilder()
                    .setCustomId(`select_cfg_adv_cargo_${tipoSelecionado}`)
                    .setPlaceholder(`Selecione o cargo correspondente para ${tipoSelecionado}`);

                const row = new ActionRowBuilder().addComponents(selectRole);
                return interaction.reply({ content: `🛡️ Selecione abaixo qual cargo do Discord representará o **${tipoSelecionado}**:`, components: [row], flags: [MessageFlags.Ephemeral] });
            }

            if (interaction.customId === 'config_canais') {
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('📺 𝘾𝙤𝙣figuração de Canais')
                    .setDescription('Escolha qual canal deseja configurar abaixo:');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_canal_aviso').setLabel('📢 Canal Avisos').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('set_canal_log').setLabel('📋 Canal Logs Pontos').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('set_canal_punicao').setLabel('🚨 Canal Logs Punições').setStyle(ButtonStyle.Primary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_canal_avisos_punicao').setLabel('📢 Canal Avisos Punição').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('voltar_painel').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row, row2] });
            }

            if (interaction.customId === 'set_canal_aviso') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
                const select = new ChannelSelectMenuBuilder()
                    .setCustomId('select_canal_aviso')
                    .setChannelTypes([ChannelType.GuildText])
                    .setPlaceholder('Selecione o canal de avisos');
                const row = new ActionRowBuilder().addComponents(select);
                return interaction.followUp({ content: '📢 Selecione abaixo o canal para receber os **Avisos de Subida de Cargo**:', components: [row], flags: [MessageFlags.Ephemeral] });
            }

            if (interaction.customId === 'set_canal_log') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
                const select = new ChannelSelectMenuBuilder()
                    .setCustomId('select_canal_log')
                    .setChannelTypes([ChannelType.GuildText])
                    .setPlaceholder('Selecione o canal de logs');
                const row = new ActionRowBuilder().addComponents(select);
                return interaction.followUp({ content: '📋 Selecione abaixo o canal para receber os **Logs de Pontos**:', components: [row], flags: [MessageFlags.Ephemeral] });
            }

            if (interaction.customId === 'set_canal_punicao') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
                const select = new ChannelSelectMenuBuilder()
                    .setCustomId('select_canal_punicao_log')
                    .setChannelTypes([ChannelType.GuildText])
                    .setPlaceholder('Selecione o canal de logs de punição');
                const row = new ActionRowBuilder().addComponents(select);
                return interaction.followUp({ content: '🚨 Selecione abaixo o canal onde os **Logs de Punições** serão enviados:', components: [row], flags: [MessageFlags.Ephemeral] });
            }

            if (interaction.customId === 'set_canal_avisos_punicao') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});
                const select = new ChannelSelectMenuBuilder()
                    .setCustomId('select_canal_avisos_punicao')
                    .setChannelTypes([ChannelType.GuildText])
                    .setPlaceholder('Selecione o canal público de avisos de punição');
                const row = new ActionRowBuilder().addComponents(select);
                return interaction.followUp({ content: '📢 Selecione abaixo o canal **Público** onde os avisos de punição serão enviados para os membros verem:', components: [row], flags: [MessageFlags.Ephemeral] });
            }

            if (interaction.customId === 'gerenciar_metas') {
                let metas = (await getData(`metas_lista_${guildId}`)) || [];
                metas.sort((a, b) => a.pontos - b.pontos);
                const lista = metas.length === 0 ? 'Nenhuma meta configurada.' : metas.map(m => `• **${m.pontos} pts** ➔ <@&${m.cargoId}>`).join('\n');

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🎯 𝙂𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙧 𝙈𝙚𝙩𝙖𝙨')
                    .setDescription(`Metas atuais:\n${lista}\n\nEscolha o que deseja fazer:`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('add_meta_modal').setLabel('+ Adicionar Meta').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('del_meta_menu').setLabel('- Remover Meta').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('voltar_painel').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId === 'add_meta_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_add_meta')
                    .setTitle('Adicionar Nova Meta');

                const pontosInput = new TextInputBuilder()
                    .setCustomId('input_pontos_meta')
                    .setLabel('Quantidade de Pontos (ex: 100)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('100')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(pontosInput));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'del_meta_menu') {
                let metas = (await getData(`metas_lista_${guildId}`)) || [];
                metas.sort((a, b) => a.pontos - b.pontos);
                if (metas.length === 0) return interaction.reply({ content: '❌ Não há metas cadastradas para remover.', flags: [MessageFlags.Ephemeral] });

                const select = new StringSelectMenuBuilder()
                    .setCustomId('select_del_meta')
                    .setPlaceholder('Selecione a meta que deseja remover')
                    .addOptions(metas.map((m, index) => ({
                        label: `Meta de ${m.pontos} pontos`,
                        description: `Remove a meta de cargo`,
                        value: index.toString()
                    })));

                const row = new ActionRowBuilder().addComponents(select);
                return interaction.reply({ content: '👇 Selecione qual meta deseja apagar:', components: [row], flags: [MessageFlags.Ephemeral] });
            }

            if (interaction.customId === 'gerenciar_pontos') {
                const cargos = (await getData(`cargos_pontos_${guildId}`)) || [];
                const lista = cargos.length === 0 ? 'nenhum cargo configurado' : cargos.map(id => `<@&${id}>`).join(', ');

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('⚡ 𝙂𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙧 𝘾𝙖𝙧𝙜𝙤𝙨 𝙙𝙚 𝙋𝙤𝙣𝙩𝙤𝙨')
                    .setDescription(`Cargos atuais:\n${lista}\n\nEscolha o que deseja fazer:`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('menu_add_pontos').setLabel('+ Adicionar Cargo').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('menu_del_pontos').setLabel('- Remover Cargo').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('voltar_painel').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId === 'gerenciar_rank') {
                const cargos = (await getData(`cargos_rank_${guildId}`)) || [];
                const lista = cargos.length === 0 ? 'nenhum cargo configurado' : cargos.map(id => `<@&${id}>`).join(', ');

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 𝙂𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙧 𝘾𝙖𝙧𝙜os 𝙙𝙚 𝙍𝙖nk')
                    .setDescription(`Cargos atuais:\n${lista}\n\nEscolha o que deseja fazer:`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('menu_add_rank').setLabel('+ Adicionar Cargo').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('menu_del_rank').setLabel('- Remover Cargo').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('voltar_painel').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId === 'gerenciar_painel') {
                const cargos = (await getData(`cargos_painel_${guildId}`)) || [];
                const lista = cargos.length === 0 ? 'nenhum cargo configurado' : cargos.map(id => `<@&${id}>`).join(', ');

                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🛡️ 𝙂𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙧 𝘾𝙖𝙧𝙜𝙤𝙨 𝙙𝙚 𝙋𝙖𝙞𝙣𝙚𝙡')
                    .setDescription(`Cargos atuais:\n${lista}\n\nEscolha o que deseja fazer:`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('menu_add_painel').setLabel('+ Adicionar Cargo').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('menu_del_painel').setLabel('- Remover Cargo').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('voltar_painel').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId === 'voltar_painel') {
                let metas = (await getData(`metas_lista_${guildId}`)) || [];
                metas.sort((a, b) => a.pontos - b.pontos);
                let metasTexto = metas.length === 0 ? 'Nenhuma meta cadastrada' : metas.map(m => `• **${m.pontos} pts** ➔ <@&${m.cargoId}>`).join('\n');
                
                const canalLogId = await getData(`canal_log_${guildId}`);
                const canalAvisoId = await getData(`canal_aviso_${guildId}`);
                const canalPunicaoId = await getData(`canal_log_punicao_${guildId}`);
                const canalAvisosPunicaoId = await getData(`canal_avisos_punicao_${guildId}`);
                const cargoVerificadoId = await getData(`cargo_verificado_${guildId}`);

                const infoCanais = `📢 **Canal de Avisos:** ${canalAvisoId ? `<#${canalAvisoId}>` : 'Não configurado'}\n` +
                                   `📋 **Canal de Logs (Pontos):** ${canalLogId ? `<#${canalLogId}>` : 'Não configurado'}\n` +
                                   `🚨 **Canal de Logs (Punições):** ${canalPunicaoId ? `<#${canalPunicaoId}>` : 'Não configurado'}\n` +
                                   `📢 **Canal Avisos Punição (Público):** ${canalAvisosPunicaoId ? `<#${canalAvisosPunicaoId}>` : 'Não configurado'}\n` +
                                   `🛡️ **Cargo de Verificação:** ${cargoVerificadoId ? `<@&${cargoVerificadoId}>` : 'Não configurado'}\n\n`;

                const embedPainel = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('🖥️ 𝙋𝙖𝙞𝙣𝙚𝙡 𝙙𝙚 𝙂𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙢𝙚𝙣𝙩𝙤')
                    .setDescription(`📁 **𝘽𝙚𝙢-𝙫𝙞𝙣𝙙𝙤 𝙖𝙤 𝙥𝙖𝙞𝙣𝙚𝙡!**\n\n${infoCanais}🎯 **Metas Cadastradas:**\n${metasTexto}\n\n# 𝙀𝙨𝙘𝙤𝙡𝙝𝙖 𝙖𝙗𝙖𝙞𝙭𝙤 𝙤 𝙦𝙪𝙚 𝙙𝙚𝙨𝙚𝙟𝙖 𝙜𝙚𝙧𝙚𝙣𝙘𝙞𝙖𝙧:`);

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('gerenciar_pontos').setLabel('⚡ Cargos de Pontos').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('gerenciar_rank').setLabel('🏆 Cargos de Rank').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('gerenciar_painel').setLabel('🛡️ Cargos de Painel').setStyle(ButtonStyle.Primary)
                );

                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('gerenciar_metas').setLabel('🎯 Gerenciar Metas').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('config_canais').setLabel('📺 Configurar Canais').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('gerenciar_cargos_adv').setLabel('🛡️ Cargos de Punição (ADV)').setStyle(ButtonStyle.Danger)
                );

                const row3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('config_verificacao').setLabel('✅ Configurar Verificação').setStyle(ButtonStyle.Success)
                );
                return interaction.update({ embeds: [embedPainel], components: [row1, row2, row3] });
            }

            if (['menu_add_pontos', 'menu_del_pontos', 'menu_add_rank', 'menu_del_rank', 'menu_add_painel', 'menu_del_painel'].includes(interaction.customId)) {
                const acao = interaction.customId.includes('add') ? 'add' : 'del';
                let tipo = 'pontos';
                if (interaction.customId.includes('rank')) tipo = 'rank';
                if (interaction.customId.includes('painel')) tipo = 'painel';

                const selectMenu = new RoleSelectMenuBuilder()
                    .setCustomId(`role_action_${acao}_${tipo}`)
                    .setPlaceholder(`Selecione o cargo para ${acao === 'add' ? 'adicionar' : 'remover'}`);

                const row = new ActionRowBuilder().addComponents(selectMenu);
                return interaction.reply({ content: `👇 Selecione o cargo que deseja **${acao === 'add' ? 'adicionar' : 'remover'}**:`, components: [row], flags: [MessageFlags.Ephemeral] });
            }
        }

        if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('select_canal_')) {
            const channelId = interaction.values[0];
            if (interaction.customId === 'select_canal_aviso') {
                await setData(`canal_aviso_${interaction.guild.id}`, channelId);
                return interaction.update({ content: `✅ Canal de Avisos configurado para <#${channelId}>!`, components: [] });
            }
            if (interaction.customId === 'select_canal_log') {
                await setData(`canal_log_${interaction.guild.id}`, channelId);
                return interaction.update({ content: `✅ Canal de Logs de Pontos configurado para <#${channelId}>!`, components: [] });
            }
            if (interaction.customId === 'select_canal_punicao_log') {
                await setData(`canal_log_punicao_${interaction.guild.id}`, channelId);
                return interaction.update({ content: `✅ Canal de Logs de Punições configurado para <#${channelId}>!`, components: [] });
            }
            if (interaction.customId === 'select_canal_avisos_punicao') {
                await setData(`canal_avisos_punicao_${interaction.guild.id}`, channelId);
                return interaction.update({ content: `✅ Canal Público de Avisos de Punição configurado para <#${channelId}>!`, components: [] });
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_add_meta') {
            const pontosStr = interaction.fields.getTextInputValue('input_pontos_meta');
            const pontos = parseInt(pontosStr);

            if (isNaN(pontos) || pontos <= 0) {
                return interaction.reply({ content: '❌ Digite um número de pontos válido!', flags: [MessageFlags.Ephemeral] });
            }

            const selectMenu = new RoleSelectMenuBuilder()
                .setCustomId(`role_meta_${pontos}`)
                .setPlaceholder('Selecione o cargo correspondente a esta meta');

            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({ content: `🎯 Meta de **${pontos} pontos** escolhida. Selecione o cargo correspondente:`, components: [row], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_del_meta') {
            const indexToDelete = parseInt(interaction.values[0]);
            let metas = (await getData(`metas_lista_${interaction.guild.id}`)) || [];
            metas.sort((a, b) => a.pontos - b.pontos);
            
            if (metas[indexToDelete]) {
                const removida = metas.splice(indexToDelete, 1)[0];
                await setData(`metas_lista_${interaction.guild.id}`, metas);
                return interaction.update({ content: `🗑️ Meta de **${removida.pontos} pontos** removida com sucesso!`, components: [] });
            }
            return interaction.update({ content: '❌ Meta não encontrada.', components: [] });
        }

        if (interaction.isRoleSelectMenu()) {
            const selectedRoleId = interaction.values[0];

            if (interaction.customId.startsWith('select_cfg_adv_cargo_')) {
                const tipo = interaction.customId.replace('select_cfg_adv_cargo_', '');
                await setData(`cargo_punicao_${interaction.guild.id}_${tipo}`, selectedRoleId);

                return interaction.update({ 
                    content: `✅ Cargo para **${tipo}** vinculado com sucesso ao cargo <@&${selectedRoleId}>!`, 
                    components: [] 
                });
            }

            if (interaction.customId.startsWith('role_meta_')) {
                const pontos = parseInt(interaction.customId.replace('role_meta_', ''));
                let metas = (await getData(`metas_lista_${interaction.guild.id}`)) || [];

                metas = metas.filter(m => m.pontos !== pontos);
                metas.push({ pontos, cargoId: selectedRoleId });
                metas.sort((a, b) => a.pontos - b.pontos);
                await setData(`metas_lista_${interaction.guild.id}`, metas);

                return interaction.update({ content: `✅ Meta salva com sucesso! **${pontos} pts** ➔ <@&${selectedRoleId}>`, components: [] });
            }

            if (interaction.customId.startsWith('role_action_')) {
                const partes = interaction.customId.split('_'); 
                const acao = partes[2];
                const tipo = partes[3];
                const dbKey = `cargos_${tipo}_${interaction.guild.id}`;
                let listaCargos = (await getData(dbKey)) || [];

                if (acao === 'add') {
                    if (!listaCargos.includes(selectedRoleId)) {
                        listaCargos.push(selectedRoleId);
                        await setData(dbKey, listaCargos);
                        return interaction.update({ content: `✅ Cargo <@&${selectedRoleId}> adicionado em **${tipo}**!`, components: [] });
                    } else {
                        return interaction.update({ content: `⚠️ Este cargo já está cadastrado em **${tipo}**!`, components: [] });
                    }
                } else if (acao === 'del') {
                    listaCargos = listaCargos.filter(id => id !== selectedRoleId);
                    await setData(dbKey, listaCargos);
                    return interaction.update({ content: `🗑️ Cargo <@&${selectedRoleId}> removido de **${tipo}**!`, components: [] });
                }
            }
        }
    } catch (err) {
        console.error('Erro no evento interactionCreate:', err);
    }
});

client.on('messageCreate', async (message) => {
    try {
        if (db && await handleRecrutamentoMessage(message, db)) return;
        if (await handlePunicoesMessage(message, PREFIX, db)) return;

        if (message.author.bot || !message.guild) return;

        const contentLower = message.content.toLowerCase();

        if (contentLower === `${PREFIX}embed`) {
            const embedData = {};
            const panel = createEmbedPanel(embedData);
            return message.reply(panel);
        }

        if (contentLower === `${PREFIX}comandos` || contentLower === `${PREFIX}ajuda`) {
            const embedComandos = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('📜 𝘾𝙤𝙢𝙖𝙣𝙙𝙤𝙨 𝙙𝙤 𝘽𝙤𝙩')
                .addFields(
                    { name: '📊 **Pontos**', value: '`•pontos @usuário` - Vê os pontos.\n`•pontos <qtd> @usuário` - Adiciona pontos.' },
                    { name: '🏆 **Rank**', value: '`•top` ou `.rank` - Mostra o ranking global de pontos.' },
                    { name: '⚙️ **Painel**', value: '`•painel` ou `/painel` - Abre o painel administrativo.' },
                    { name: '⏱️ **Bate-Ponto**', value: '`/bateponto` - Envia o painel público.\n`/painelbateponto` - Abre o painel administrativo do bate-ponto.' }
                );
            return message.reply({ embeds: [embedComandos] });
        }

        if (contentLower === `${PREFIX}painel`) {
            await enviarPainel(message.author, message.member, message.guild, message);
            return;
        }

        if (message.content.startsWith(`${PREFIX}perfil`) || message.content.startsWith(`${PREFIX}meuperfil`)) {
            const targetUser = message.mentions.users.first() || message.author;
            const currentPoints = (await getData(`pontos_${targetUser.id}`)) || 0;
            let metas = (await getData(`metas_lista_${message.guild.id}`)) || [];
            metas.sort((a, b) => a.pontos - b.pontos);
            const proximaMeta = metas.find(m => m.pontos > currentPoints) || metas[metas.length - 1];
            const metaTexto = proximaMeta ? `${currentPoints} /${proximaMeta.pontos} pts` : `${currentPoints} pts`;

            const allDocs = await db.collection('dados').find({ _id: { $regex: /^pontos_/ } }).toArray();
            const leaderboard = allDocs.sort((a, b) => b.value - a.value);

            const rankIndex = leaderboard.findIndex(item => item._id === `pontos_${targetUser.id}`);
            const posicaoTexto = rankIndex !== -1 ? `#${rankIndex + 1}` : 'Sem rank';

            const embedPerfil = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`👤 𝙋𝙚𝙧𝙛𝙞𝙡 - ${targetUser.username}`)
                .addFields(
                    { name: '📊 𝙋𝙤𝙣𝙩𝙤𝙨:', value: `**${metaTexto}**`, inline: true },
                    { name: '🏆 𝙋𝙤𝙨𝙞çã𝙤:', value: `**${posicaoTexto}**`, inline: true }
                );

            return message.reply({ embeds: [embedPerfil] });
        }

        if (message.content.startsWith(`${PREFIX}pontos`) || message.content.startsWith(`${PREFIX}addpontos`) || message.content.startsWith(`${PREFIX}verpontos`)) {
            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            args.shift();
            const targetUser = message.mentions.users.first() || message.author;
            const hasNumber = args.some(arg => !isNaN(arg));

            if (!hasNumber) {
                const currentPoints = (await getData(`pontos_${targetUser.id}`)) || 0;
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('📊 𝙎𝙖𝙡𝙙𝙤 𝙙𝙚 𝙋𝙤𝙣𝙩os')
                    .setDescription(`${targetUser} possui atualmente **${currentPoints}** pontos.`);
                return message.reply({ embeds: [embed] });
            }

            const cargosPontos = (await getData(`cargos_pontos_${message.guild.id}`)) || [];
            const isOwner = message.guild.ownerId === message.author.id;
            const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
            const temCargo = cargosPontos.length === 0 ? true : cargosPontos.some(roleId => message.member.roles.cache.has(roleId));

            if (!isAdmin && !isOwner && !temCargo) {
                return message.reply(`❌ 𝙑𝙤𝙘ê 𝙣ã𝙤 𝙩𝙚𝙢 𝙥𝙚𝙧𝙢𝙞𝙨𝙨ã𝙤 𝙥𝙖𝙧𝙖 𝙖𝙡𝙩𝙚𝙧𝙖𝙧 𝙥𝙤𝙣𝙩𝙤𝙨!`);
            }

            const amount = parseInt(args.find(arg => !isNaN(arg)));

            if (!amount || amount <= 0 || !targetUser) {
                return message.reply(`❌ 𝙐𝙨𝙤 𝙘𝙤𝙧𝙧𝙚𝙩𝙤: \`${PREFIX}𝙥𝙤𝙣𝙩os 10 @usuário\``);
            }

            let memberTarget;
            try {
                memberTarget = await message.guild.members.fetch(targetUser.id);
            } catch (e) {
                return message.reply('❌ Usuário não encontrado no servidor.');
            }

            let saldoAtual = (await getData(`pontos_${targetUser.id}`)) || 0;
            saldoAtual += amount;

            let metas = (await getData(`metas_lista_${message.guild.id}`)) || [];
            metas.sort((a, b) => a.pontos - b.pontos);

            let cargosConquistados = [];
            let cargosRemovidos = [];

            if (metas.length > 0) {
                let progredindo = true;
                while (progredindo && metas.length > 0) {
                    const metaAtual = metas[0];

                    if (saldoAtual >= metaAtual.pontos) {
                        saldoAtual -= metaAtual.pontos;
                        
                        const metasAtuaisDb = (await getData(`metas_lista_${message.guild.id}`)) || [];
                        for (const m of metasAtuaisDb) {
                            if (m.cargoId !== metaAtual.cargoId) {
                                if (memberTarget.roles.cache.has(m.cargoId)) {
                                    await memberTarget.roles.remove(m.cargoId).catch(() => {});
                                    if (!cargosRemovidos.includes(m.cargoId)) cargosRemovidos.push(m.cargoId);
                                }
                            }
                        }

                        if (!memberTarget.roles.cache.has(metaAtual.cargoId)) {
                            await memberTarget.roles.add(metaAtual.cargoId).catch(() => {});
                        }
                        cargosConquistados.push(metaAtual.cargoId);
                        metas.shift();
                    } else {
                        progredindo = false;
                    }
                }
            }

            await setData(`pontos_${targetUser.id}`, saldoAtual);

            let descExtra = `📊 **Saldo Acumulado (Restante):** **${saldoAtual}** pontos`;
            if (cargosConquistados.length > 0) {
                const cargosStr = cargosConquistados.map(id => `<@&${id}>`).join(', ');
                descExtra += `\n🎉 **Meta Batida!** O usuário conquistou o(s) cargo(s): ${cargosStr}.`;
            }
            if (cargosRemovidos.length > 0) {
                const removidosStr = cargosRemovidos.map(id => `<@&${id}>`).join(', ');
                descExtra += `\n🔄 **Cargo Anterior Removido:** ${removidosStr}.`;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 𝙋𝙤𝙣𝙩𝙤𝙨 𝘼𝙙𝙞𝙘𝙞𝙤𝙣𝙖𝙙𝙤𝙨!')
                .setDescription(`Foram enviados **${amount}** pontos para ${targetUser}.\n${descExtra}`);

            if (cargosConquistados.length > 0) {
                await enviarAvisoMeta(message.guild, message, embed);
            } else {
                await message.reply({ embeds: [embed] });
            }

            const embedLog = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📈 𝙇𝙤𝙜: 𝙋𝙤𝙣𝙩𝙤𝙨 𝘼𝙙𝙞𝙘𝙞𝙤𝙣𝙖𝙙𝙤𝙨')
                .addFields(
                    { name: '🛡️ Admin:', value: `${message.author}`, inline: true },
                    { name: '👤 Membro:', value: `${targetUser}`, inline: true },
                    { name: '➕ Adicionado:', value: `+${amount} pontos`, inline: false }
                );
            registrarLog(message.guild, embedLog);

            return;
        }

        if (message.content.startsWith(`${PREFIX}removerpontos`) || message.content.startsWith(`${PREFIX}delpontos`)) {
            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            args.shift();
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args.find(arg => !isNaN(arg)));

            if (!amount || !targetUser) return message.reply('❌ Uso: `.removerpontos 10 @usuário`');

            let currentPoints = (await getData(`pontos_${targetUser.id}`)) || 0;
            currentPoints = Math.max(0, currentPoints - amount);
            await setData(`pontos_${targetUser.id}`, currentPoints);

            return message.reply(`🗑️ Removidos **${amount}** pontos de ${targetUser}. Saldo atual: **${currentPoints}**`);
        }

        if (message.content.startsWith(`${PREFIX}top`) || message.content.startsWith(`${PREFIX}rank`)) {
            const allDocs = await db.collection('dados').find({ _id: { $regex: /^pontos_/ } }).toArray();
            const leaderboard = allDocs
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);

            if (leaderboard.length === 0) return message.reply('ℹ️ Nenhum usuário possui pontos ainda.');

            let listaText = '';
            for (let i = 0; i < leaderboard.length; i++) {
                const userId = leaderboard[i]._id.replace('pontos_', '');
                const pontos = leaderboard[i].value;
                listaText += `**#${i + 1}** <@${userId}> - **${pontos}** pontos\n`;
            }

            const embedTop = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏆 𝙍𝙖𝙣𝙠𝙞𝙣𝙜 𝙂𝙡𝙤𝙗𝙖𝙡')
                .setDescription(listaText);

            return message.reply({ embeds: [embedTop] });
        }
    } catch (err) {
        console.error('Erro no evento messageCreate:', err);
    }
});

client.login(TOKEN);
