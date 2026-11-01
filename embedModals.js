const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function getTitleModal(current = {}) {
    const modal = new ModalBuilder().setCustomId('modal_title').setTitle('Altere o título do seu Embed.');
    
    const titleInput = new TextInputBuilder()
        .setCustomId('embed_title')
        .setLabel('Título')
        .setStyle(TextInputStyle.Short)
        .setValue(current.title || '')
        .setRequired(true);

    const urlInput = new TextInputBuilder()
        .setCustomId('embed_title_url')
        .setLabel('URL do Título')
        .setPlaceholder('De forma opcional, ao clicar no título...')
        .setStyle(TextInputStyle.Short)
        .setValue(current.url || '')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(urlInput)
    );
    return modal;
}

function getDescModal(current = '') {
    const modal = new ModalBuilder().setCustomId('modal_desc').setTitle('Definir Descrição');
    const input = new TextInputBuilder().setCustomId('embed_desc').setLabel('Descrição do Embed').setStyle(TextInputStyle.Paragraph).setValue(current || '').setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

function getColorModal(current = '') {
    const modal = new ModalBuilder().setCustomId('modal_color').setTitle('Definir Cor Personalizada');
    const input = new TextInputBuilder().setCustomId('embed_color').setLabel('Cor em HEX (ex: #5865F2)').setStyle(TextInputStyle.Short).setValue(current || '').setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

function getAuthorModal(current = {}) {
    const modal = new ModalBuilder().setCustomId('modal_author').setTitle('Definir Autor');
    const name = new TextInputBuilder().setCustomId('author_name').setLabel('Nome do Autor').setStyle(TextInputStyle.Short).setValue(current.name || '').setRequired(true);
    const icon = new TextInputBuilder().setCustomId('author_icon').setLabel('URL do Ícone do Autor').setStyle(TextInputStyle.Short).setValue(current.iconURL || '').setRequired(false);
    const url = new TextInputBuilder().setCustomId('author_url').setLabel('URL do Link do Autor').setStyle(TextInputStyle.Short).setValue(current.url || '').setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(icon), new ActionRowBuilder().addComponents(url));
    return modal;
}

function getImagesModal(current = {}) {
    const modal = new ModalBuilder().setCustomId('modal_images').setTitle('Definir Imagens');
    const image = new TextInputBuilder().setCustomId('embed_image').setLabel('URL da Imagem Grande').setStyle(TextInputStyle.Short).setValue(current.image || '').setRequired(false);
    const thumbnail = new TextInputBuilder().setCustomId('embed_thumbnail').setLabel('URL da Miniatura (Thumbnail)').setStyle(TextInputStyle.Short).setValue(current.thumbnail || '').setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(image), new ActionRowBuilder().addComponents(thumbnail));
    return modal;
}

function getFooterModal(current = {}) {
    const modal = new ModalBuilder().setCustomId('modal_footer').setTitle('Definir Rodapé');
    const text = new TextInputBuilder().setCustomId('footer_text').setLabel('Texto do Rodapé').setStyle(TextInputStyle.Short).setValue(current.text || '').setRequired(true);
    const icon = new TextInputBuilder().setCustomId('footer_icon').setLabel('URL do Ícone do Rodapé').setStyle(TextInputStyle.Short).setValue(current.iconURL || '').setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(text), new ActionRowBuilder().addComponents(icon));
    return modal;
}

function getFieldModal() {
    const modal = new ModalBuilder().setCustomId('modal_field').setTitle('Adicionar Campo');
    const name = new TextInputBuilder().setCustomId('field_name').setLabel('Título do Campo').setStyle(TextInputStyle.Short).setRequired(true);
    const value = new TextInputBuilder().setCustomId('field_value').setLabel('Conteúdo do Campo').setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(value));
    return modal;
}

module.exports = { getTitleModal, getDescModal, getColorModal, getAuthorModal, getImagesModal, getFooterModal, getFieldModal };