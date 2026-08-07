const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
        new ButtonBuilder().setCustomId('hide_room').setLabel('إخفاء').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('unhide_room').setLabel('إظهار').setStyle(ButtonStyle.Secondary).setEmoji('👁️')
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

client.on('interactionCreate', async interaction => {
    const channelId = interaction.channelId;
    const ownerId = tempVoiceChannels.get(channelId);

    if (ownerId && interaction.user.id !== ownerId) {
        if (interaction.isRepliable()) {
            return interaction.reply({ content: '❌ عذراً، هذه القناة ليست ملكك للتحكم بها!', ephemeral: true });
        }
        return;
    }

    const voiceChannel = interaction.guild.channels.cache.get(channelId);

    if (interaction.isButton()) {
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
        else if (interaction.customId === 'kick_user') {
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('select_kick')
                .setPlaceholder('اختر العضو المراد طرده')
                .setMinValues(1)
                .setMaxValues(1);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({ content: 'اختر العضو المراد طرده من القائمة أدناه:', components: [row], ephemeral: true });
        }
        else if (interaction.customId === 'ban_user') {
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('select_ban')
                .setPlaceholder('اختر العضو لحظره من الروم')
                .setMinValues(1)
                .setMaxValues(1);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({ content: 'اختر العضو لحظره من القائمة أدناه:', components: [row], ephemeral: true });
        }
        else if (interaction.customId === 'unban_user') {
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('select_unban')
                .setPlaceholder('اختر العضو لفك الحظر عنه')
                .setMinValues(1)
                .setMaxValues(1);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({ content: 'اختر العضو لفك الحظر عنه من القائمة أدناه:', components: [row], ephemeral: true });
        }
        else if (interaction.customId === 'invite_user') {
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('select_invite')
                .setPlaceholder('اختر العضو لدعوته إلى الروم')
                .setMinValues(1)
                .setMaxValues(1);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({ content: 'اختر العضو لدعوته من القائمة أدناه:', components: [row], ephemeral: true });
        }
        else if (interaction.customId === 'allow_user') {
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('select_allow')
                .setPlaceholder('اختر العضو للسماح له (مع ميوت ودفن)')
                .setMinValues(1)
                .setMaxValues(1);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({ content: 'اختر العضو للسماح له بالدخول وإعطائه صلاحيات الميوت والدفن:', components: [row], ephemeral: true });
        }
        else if (interaction.customId === 'deny_user') {
            const selectMenu = new UserSelectMenuBuilder()
                .setCustomId('select_deny')
                .setPlaceholder('اختر العضو لإلغاء السماح عنه')
                .setMinValues(1)
                .setMaxValues(1);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({ content: 'اختر العضو لإلغاء السماح وصلاحيات الميوت والدفن عنه:', components: [row], ephemeral: true });
        }
        else if (interaction.customId === 'limit_room') {
            const modal = new ModalBuilder().setCustomId('modal_limit').setTitle('تحديد الحد الأقصى للأعضاء');
            const input = new TextInputBuilder().setCustomId('limit_input').setLabel('أدخل الرقم (من 0 إلى 99):').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        else if (interaction.customId === 'rename_room') {
            const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('تغيير اسم الروم');
            const input = new TextInputBuilder().setCustomId('rename_input').setLabel('أدخل الاسم الجديد:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        else if (interaction.customId === 'region_room') {
            const modal = new ModalBuilder().setCustomId('modal_region').setTitle('تغيير ريجن الروم');
            const input = new TextInputBuilder().setCustomId('region_input').setLabel('أدخل الريجن (مثال: us-central, brazil.. أو ترك):').setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        else {
            return interaction.reply({ content: `✅ تم تنفيذ أمر الزر بنجاح!`, ephemeral: true });
        }
    }

    if (interaction.isUserSelectMenu()) {
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ لم يتم العثور على الروم الصوتي.', ephemeral: true });
        }

        const targetId = interaction.values[0];

        try {
            if (interaction.customId === 'select_kick') {
                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
                    await targetMember.voice.disconnect();
                    await interaction.update({ content: `👢 تم طرد العضو <@${targetId}> من الروم بنجاح.`, components: [] });
                } else {
                    await interaction.update({ content: '❌ العضو ليس موجوداً في رومك الصوتي حالياً!', components: [] });
                }
            } 
            else if (interaction.customId === 'select_ban') {
                await voiceChannel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
                    await targetMember.voice.disconnect().catch(() => {});
                }
                await interaction.update({ content: `👤 تم حظر العضو <@${targetId}> من الروم وإخفائه عنه.`, components: [] });
            }
            else if (interaction.customId === 'select_unban') {
                await voiceChannel.permissionOverwrites.delete(targetId).catch(() => {});
                await interaction.update({ content: `👤 تم فك الحظر عن العضو <@${targetId}> وإرجاع وضعه الطبيعي.`, components: [] });
            }
            else if (interaction.customId === 'select_invite') {
                const targetUser = await client.users.fetch(targetId).catch(() => null);
                if (targetUser) {
                    const invite = await voiceChannel.createInvite({ maxUses: 1, maxAge: 300 }).catch(() => null);
                    if (invite) {
                        await targetUser.send(`لقد تلقيت دعوة للانضمام إلى روم <#${voiceChannel.id}> الصوتي:\nhttps://discord.gg/${invite.code}`).catch(() => {});
                        await interaction.update({ content: `✉️ تم إرسال دعوة خاصة في الخاص للعضو <@${targetId}>.`, components: [] });
                    } else {
                        await interaction.update({ content: '❌ لم أستطع إنشاء دعوة لهذا الروم.', components: [] });
                    }
                } else {
                    await interaction.update({ content: '❌ لم أتمكن من العثور على هذا المستخدم.', components: [] });
                }
            }
            else if (interaction.customId === 'select_allow') {
                await voiceChannel.permissionOverwrites.edit(targetId, { 
                    Connect: true, 
                    ViewChannel: true,
                    MuteMembers: true,
                    DeafenMembers: true
                });
                await interaction.update({ content: `✅ تم السماح للعضو <@${targetId}> بدخول الروم مع إعطائه صلاحيات الميوت والدفن.`, components: [] });
            } 
            else if (interaction.customId === 'select_deny') {
                await voiceChannel.permissionOverwrites.edit(targetId, { 
                    Connect: false,
                    MuteMembers: false,
                    DeafenMembers: false
                });
                await interaction.update({ content: `⛔ تم إلغاء السماح وصلاحيات الميوت والدفن عن العضو <@${targetId}>.`, components: [] });
            }
        } catch (err) {
            console.error(err);
            await interaction.update({ content: '❌ حدث خطأ أثناء تطبيق الإجراء.', components: [] });
        }
    }

    if (interaction.isModalSubmit()) {
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ لم يتم العثور على الروم الصوتي.', ephemeral: true });
        }

        if (interaction.customId === 'modal_limit') {
            const limitVal = parseInt(interaction.fields.getTextInputValue('limit_input'));
            if (isNaN(limitVal) || limitVal < 0 || limitVal > 99) {
                return interaction.reply({ content: '❌ أدخل رقم صحيح بين 0 و 99!', ephemeral: true });
            }
            await voiceChannel.setUserLimit(limitVal);
            return interaction.reply({ content: `⏱️ تم تعديل الحد الأقصى للأعضاء إلى: **${limitVal}**`, ephemeral: true });
        }
        else if (interaction.customId === 'modal_rename') {
            const newName = interaction.fields.getTextInputValue('rename_input');
            await voiceChannel.setName(newName);
            return interaction.reply({ content: `✏️ تم تغيير اسم الروم إلى: **${newName}**`, ephemeral: true });
        }
        else if (interaction.customId === 'modal_region') {
            const regionVal = interaction.fields.getTextInputValue('region_input');
            await voiceChannel.setRTCRegion(regionVal ? regionVal.toLowerCase() : null);
            return interaction.reply({ content: `🌍 تم تحديث ريجن الروم بنجاح.`, ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
