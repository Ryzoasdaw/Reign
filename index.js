const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const tempVoiceChannels = new Map();

function getControlUI(member) {
    const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle('لوحة تحكم الروم الصوتي المؤقت')
        .setDescription('استخدم الأزرار أدناه للتحكم في قناتك الصوتية:')
        .setFooter({ text: `أنشأ بواسطة ${member.displayName}`, iconURL: member.user.displayAvatarURL() });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lock_room').setLabel('قفل').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('unlock_room').setLabel('افتح').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('unhide_room').setLabel('إظهار').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
        new ButtonBuilder().setCustomId('hide_room').setLabel('إخفاء').setStyle(ButtonStyle.Secondary).setEmoji('🔒')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('kick_user').setLabel('طرد').setStyle(ButtonStyle.Secondary).setEmoji('👢'),
        new ButtonBuilder().setCustomId('ban_user').setLabel('حظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('unban_user').setLabel('إلغاء الحظر').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('invite_user').setLabel('دعوة').setStyle(ButtonStyle.Secondary).setEmoji('✉️')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rename_room').setLabel('تغيير الاسم').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('limit_room').setLabel('الحد الأقصى').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId('region_room').setLabel('الريجن').setStyle(ButtonStyle.Secondary).setEmoji('🌍'),
        new ButtonBuilder().setCustomId('allow_user').setLabel('سماح').setStyle(ButtonStyle.Success)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('deny_user').setLabel('إلغاء السماح').setStyle(ButtonStyle.Danger)
    );

    return {
        content: `<@${member.id}>`,
        embeds: [embed],
        components: [row1, row2, row3, row4]
    };
}

client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const member = newState.member;
    if (!member || member.user.bot) return;

    if (newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            const voiceChannel = await guild.channels.create({
                name: `🔊 | ${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: process.env.CATEGORY_ID,
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                    { 
                        id: member.id, 
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.Connect, 
                            PermissionFlagsBits.ManageChannels, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ] 
                    },
                    { 
                        id: client.user.id, 
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.Connect, 
                            PermissionFlagsBits.ManageChannels, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ] 
                    }
                ]
            });

            tempVoiceChannels.set(voiceChannel.id, member.id);
            await member.voice.setChannel(voiceChannel);

            setTimeout(async () => {
                try {
                    await voiceChannel.send(getControlUI(member));
                } catch (err) {
                    console.error("خطأ في إرسال اللوحة داخل شات الصوت:", err);
                }
            }, 1500);

        } catch (err) {
            console.error("خطأ أثناء إنشاء الروم الصوتي:", err);
        }
    }

    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const voiceChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (voiceChannel && voiceChannel.members.size === 0) {
            tempVoiceChannels.delete(oldState.channelId);
            await voiceChannel.delete().catch(() => {});
        }
    }
});

// معالجة الأزرار والنوافذ المنبثقة
client.on('interactionCreate', async interaction => {
    const channelId = interaction.channelId;
    const ownerId = tempVoiceChannels.get(channelId);

    // التحقق أن الشخص هو صاحب الروم (للأزرار والنوافذ التابعة له)
    if (ownerId && interaction.user.id !== ownerId && !interaction.isRepliable()) {
        return;
    }

    // التعامل مع الأزرار
    if (interaction.isButton()) {
        if (!ownerId || interaction.user.id !== ownerId) {
            return interaction.reply({ content: '❌ عذراً، هذه القناة ليست ملكك للتحكم بها!', ephemeral: true });
        }

        const voiceChannel = interaction.guild.channels.cache.get(channelId);
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ لم يتم العثور على الروم الصوتي المرتبط!', ephemeral: true });
        }

        if (interaction.customId === 'lock_room') {
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
            return interaction.reply({ content: '🔒 تم قفل الروم بنجاح.', ephemeral: true });
        } 
        else if (interaction.customId === 'unlock_room') {
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
            return interaction.reply({ content: '🔓 تم فتح الروم بنجاح.', ephemeral: true });
        }
        else if (interaction.customId === 'hide_room') {
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
            return interaction.reply({ content: '🔒 تم إخفاء الروم بنجاح.', ephemeral: true });
        }
        else if (interaction.customId === 'unhide_room') {
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
            return interaction.reply({ content: '👁️ تم إظهار الروم بنجاح.', ephemeral: true });
        }
        // فتح نافذة منبثقة لإدخال آيدي العضو للطرد
        else if (interaction.customId === 'kick_user') {
            const modal = new ModalBuilder().setCustomId('modal_kick').setTitle('طرد عضو من الروم');
            const input = new TextInputBuilder().setCustomId('target_id').setLabel('أدخل آيدي العضو (User ID)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        // فتح نافذة منبثقة للسماح لعضو
        else if (interaction.customId === 'allow_user') {
            const modal = new ModalBuilder().setCustomId('modal_allow').setTitle('سماح لعضو بالدخول');
            const input = new TextInputBuilder().setCustomId('target_id').setLabel('أدخل آيدي العضو (User ID)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        // فتح نافذة منبثقة لإلغاء السماح
        else if (interaction.customId === 'deny_user') {
            const modal = new ModalBuilder().setCustomId('modal_deny').setTitle('إلغاء السماح عن عضو');
            const input = new TextInputBuilder().setCustomId('target_id').setLabel('أدخل آيدي العضو (User ID)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        else {
            return interaction.reply({ content: `✅ تم تنفيذ أمر الزر (${interaction.customId}) بنجاح!`, ephemeral: true });
        }
    }

    // التعامل مع النوافذ المنبثقة (Modals) بعد إدخال الآيدي
    if (interaction.isModalSubmit()) {
        const targetId = interaction.fields.getTextInputValue('target_id');
        const voiceChannel = interaction.guild.channels.cache.get(channelId);
        
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ لم يتم العثور على الروم الصوتي.', ephemeral: true });
        }

        try {
            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
            if (!targetMember) {
                return interaction.reply({ content: '❌ لم يتم العثور على العضو بهذا الآيدي تأكد منه!', ephemeral: true });
            }

            if (interaction.customId === 'modal_kick') {
                if (targetMember.voice.channelId === voiceChannel.id) {
                    await targetMember.voice.disconnect();
                    await interaction.reply({ content: `👢 تم طرد العضو <@${targetId}> من الروم بنجاح.`, ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ العضو ليس موجوداً في رومك الصوتي حالياً!', ephemeral: true });
                }
            } 
            else if (interaction.customId === 'modal_allow') {
                await voiceChannel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
                await interaction.reply({ content: `✅ تم السماح للعضو <@${targetId}> بدخول الروم.`, ephemeral: true });
            } 
            else if (interaction.customId === 'modal_deny') {
                await voiceChannel.permissionOverwrites.edit(targetId, { Connect: false });
                await interaction.reply({ content: `⛔ تم إلغاء السماح عن العضو <@${targetId}>.`, ephemeral: true });
            }
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ حدث خطأ أثناء تطبيق الإجراء، تأكد من صحة الآيدي.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
