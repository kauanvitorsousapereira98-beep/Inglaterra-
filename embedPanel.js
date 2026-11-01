const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function createEmbedPanel(embedData = {}) {
    const previewEmbed = new EmbedBuilder();
    
    // Suporte para Título e URL do Título
    if (embedData.title) {
        if (embedData.titleUrl) {
            previewEmbed.setTitle(embedData.title).setURL(embedData.titleUrl);
        } else {
            previewEmbed.setTitle(embedData.title);
        }
    } else {
        previewEmbed.setTitle('Título do Embed (Exemplo)');
    }

    previewEmbed.setDescription(embedData.description || 'Esta é a descrição de exemplo do seu embed.')
                .setColor(embedData.color || '#5865F2');

    if (embedData.author && embedData.author.name) {
        previewEmbed.setAuthor(embedData.author);
    }
    if (embedData.footer && embedData.footer.text) {
        previewEmbed.setFooter(embedData.footer);
    }
    if (embedData.image) {
        previewEmbed.setImage(embedData.image);
    }
    if (embedData.thumbnail) {
        previewEmbed.setThumbnail(embedData.thumbnail);
    }
    if (embedData.fields && embedData.fields.length > 0) {
        previewEmbed.addFields(embedData.fields);
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_title').setLabel('✏️ Título').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_desc').setLabel('📄 Descrição').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_color').setLabel('🎨 Cor').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_author').setLabel('👤 Autor').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_images').setLabel('🖼️ Imagens').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_footer').setLabel('📌 Rodapé').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_fields').setLabel('📋 Campos').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_send_fast').setLabel('🚀 Enviar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_reset').setLabel('🗑️ Limpar').setStyle(ButtonStyle.Danger)
    );

    return {
        content: '⚙️ **Construtor de Embeds Interativo**\nPersonalize o seu embed abaixo:',
        embeds: [previewEmbed],
        components: [row1, row2, row3]
    };
}

module.exports = { createEmbedPanel };