const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    StringSelectMenuBuilder,
    ButtonStyle, 
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// تخزين ملكية الرومات المؤقتة، الأعضاء المختارين، والمؤقتات
const tempChannels = new Map();
const selectedUsers = new Map();
const roomIntervals = new Map();

client.once('ready', () => {
    console.log(`🤖 البوت متصل باسم: ${client.user.tag}`);
});

// دالة لتحديث لوحة التحكم والقائمة المنسدلة
async function updateControlPanel(channel, ownerId) {
    const members = channel.members.filter(m => m.id !== ownerId);

    const options = members.size > 0 ? members.map(m => ({
        label: m.displayName.substring(0, 25),
        value: m.id,
        description: 'تحكم في العضو'
    })) : [{ label: 'لا توجد أعضاء أخرى بالروم', value: 'none', description: 'فارغ' }];

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_lock').setLabel('قفل').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unlock').setLabel('فتح').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_hide').setLabel('اخفى').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_show').setLabel('إظهار').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_allow').setLabel('سماح اداري').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_deny').setLabel('ازالة اداري').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_kick').setLabel('طرد').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_limit').setLabel('حد').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_name').setLabel('الاسم').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_mute').setLabel('ميوت').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_unmute').setLabel('فك').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_delete').setLabel('حذف').setStyle(ButtonStyle.Danger)
    );

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_target')
            .setPlaceholder('اختر العضو لتطبيق الصلاحيات أو الميوت أو الطرد...')
            .addOptions(options)
    );

    return { components: [row1, row2, row3, selectMenu] };
}

// 1. حدث دخول الصوت والإنشاء التلقائي واللوقات
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const logChannelId = process.env.LOG_CHANNEL_ID;
    const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
    const member = newState.member || oldState.member;

    if (!member) return;

    // أ. إنشاء الروم عند دخول روم الإنشاء
    if (newState.channelId && newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            const tempChannel = await guild.channels.create({
                name: `🔊 | ${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: process.env.CATEGORY_ID || null,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels],
                    }
                ]
            });

            tempChannels.set(tempChannel.id, member.id);
            await member.voice.setChannel(tempChannel).catch(() => {});

            // 📜 لوق إنشاء الروم
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                    .setTitle('Create Temporary Channel')
                    .setDescription(`**Channel:** \`${tempChannel.name}\`\n**By:** \`${member.user.tag}\`\n**In:** <#${tempChannel.id}>`)
                    .setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(() => {});
            }

            const panel = await updateControlPanel(tempChannel, member.id);
            const controlMsg = await tempChannel.send({
                content: `<@${member.id}> أهلاً بك في رومك المؤقت، استخدم الأزرار والقائمة أدناه للتحكم:`,
                ...panel
            });

            tempChannel.controlMessageId = controlMsg.id;

            // تفعيل مؤقت كل 15 دقيقة
            const interval = setInterval(async () => {
                try {
                    const currentChannel = guild.channels.cache.get(tempChannel.id);
                    if (!currentChannel || currentChannel.members.size === 0) {
                        clearInterval(interval);
                        roomIntervals.delete(tempChannel.id);
                        return;
                    }
                    await currentChannel.send(`⏰ تذكير: <@${member.id}> لا تنسى إدارة رومك الصوتي عبر الأزرار أدناه.`);
                } catch (e) {
                    clearInterval(interval);
                }
            }, 15 * 60 * 1000);

            roomIntervals.set(tempChannel.id, interval);

        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم:', error);
        }
    }

    // ب. حذف الروم تلقائياً عند خروج الجميع
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (channel) {
            const ownerId = tempChannels.get(channel.id);
            if (channel.members.size === 0) {
                const channelName = channel.name;
                tempChannels.delete(channel.id);
                selectedUsers.delete(channel.id);
                
                if (roomIntervals.has(channel.id)) {
                    clearInterval(roomIntervals.get(channel.id));
                    roomIntervals.delete(channel.id);
                }

                await channel.delete().catch(() => {});

                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('Delete Temporary Channel')
                        .setDescription(`**Channel:** \`${channelName}\``)
                        .setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            } else if (channel.controlMessageId) {
                try {
                    const msg = await channel.messages.fetch(channel.controlMessageId);
                    const panel = await updateControlPanel(channel, ownerId);
                    await msg.edit(panel);
                } catch (e) {}
            }
        }
    }

    // تحديث القائمة عند دخول شخص جديد للروم
    if (newState.channelId && tempChannels.has(newState.channelId)) {
        const channel = newState.guild.channels.cache.get(newState.channelId);
        if (channel && channel.controlMessageId) {
            const ownerId = tempChannels.get(channel.id);
            try {
                const msg = await channel.messages.fetch(channel.controlMessageId);
                const panel = await updateControlPanel(channel, ownerId);
                await msg.edit(panel);
            } catch (e) {}
        }
    }

    // ج. لوق خروج عضو
    if (oldState.channelId && !newState.channelId && logChannel) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setTitle('Leave Voice Channel')
            .setDescription(`**Member:** \`${member.user.tag}\`\n**Channel:** \`${oldState.channel ? oldState.channel.name : 'Unknown'}\``)
            .setTimestamp();
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // د. لوق الميوت الإداري
    if (oldState.channelId && newState.channelId && oldState.channelId === newState.channelId && logChannel) {
        const channelName = newState.channel ? newState.channel.name : 'Unknown';
        const memberTag = member.user.tag;

        if (!oldState.serverMute && newState.serverMute) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setAuthor({ name: memberTag, iconURL: member.user.displayAvatarURL() })
                .setTitle('Server Mute Member')
                .setDescription(`**To:** \`${memberTag}\`\n**In:** \`${channelName}\``)
                .setTimestamp();
            logChannel.send({ embeds: [embed] }).catch(() => {});
        } else if (oldState.serverMute && !newState.serverMute) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setAuthor({ name: memberTag, iconURL: member.user.displayAvatarURL() })
                .setTitle('UnMute Member')
                .setDescription(`**To:** \`${memberTag}\`\n**In:** \`${channelName}\``)
                .setTimestamp();
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }

        if (!oldState.serverDeaf && newState.serverDeaf) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setAuthor({ name: memberTag, iconURL: member.user.displayAvatarURL() })
                .setTitle('Server Deafen Member')
                .setDescription(`**To:** \`${memberTag}\`\n**In:** \`${channelName}\``)
                .setTimestamp();
            logChannel.send({ embeds: [embed] }).catch(() => {});
        } else if (oldState.serverDeaf && !newState.serverDeaf) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setAuthor({ name: memberTag, iconURL: member.user.displayAvatarURL() })
                .setTitle('Server UnDeafen Member')
                .setDescription(`**To:** \`${memberTag}\`\n**In:** \`${channelName}\``)
                .setTimestamp();
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// 2. التحكم بالأزرار والنوافذ التفاعلية
client.on('interactionCreate', async (interaction) => {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
    const channel = interaction.channel;
    
    if (!channel || !tempChannels.has(channel.id)) return;
    const ownerId = tempChannels.get(channel.id);

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ أنت لست صاحب هذا الروم!', ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_target') {
        const targetId = interaction.values[0];
        selectedUsers.set(channel.id, targetId);
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        const name = targetMember ? targetMember.displayName : targetId;
        return interaction.reply({ content: `✅ تم اختيار العضو: **${name}**`, ephemeral: true });
    }

    if (interaction.isButton()) {
        const userTag = interaction.user.tag;
        const channelName = channel.name;

        if (interaction.customId !== 'btn_name' && interaction.customId !== 'btn_limit') {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }

        switch (interaction.customId) {
            case 'btn_lock':
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
                await interaction.editReply({ content: '🔒 تم قفل الروم.' });
                if (logChannel) {
                    const embed = new EmbedBuilder().setColor(0xFFA500).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Lock Voice Channel').setDescription(`**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                break;

            case 'btn_unlock':
                await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                await interaction.editReply({ content: '🔓 تم فتح الروم.' });
                if (logChannel) {
                    const embed = new EmbedBuilder().setColor(0x00FF00).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Unlock Voice Channel').setDescription(`**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                break;

            case 'btn_hide':
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                await interaction.editReply({ content: '👻 تم إخفاء الروم.' });
                if (logChannel) {
                    const embed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Hide Voice Channel').setDescription(`**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                break;

            case 'btn_show':
                await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                await interaction.editReply({ content: '👁️ تم إظهار الروم.' });
                if (logChannel) {
                    const embed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Show Voice Channel').setDescription(`**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                break;

            case 'btn_name': {
                const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('تغيير اسم الروم');
                const input = new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }

            case 'btn_limit': {
                const modal = new ModalBuilder().setCustomId('modal_limit').setTitle('تحديد عدد الأعضاء');
                const input = new TextInputBuilder().setCustomId('new_limit').setLabel('العدد (0 للـ غير محدود)').setStyle(TextInputStyle.Short).setPlaceholder('مثال: 5').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                break;
            }

            case 'btn_allow': {
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                const targetTag = targetMember ? targetMember.user.tag : targetId;

                await channel.permissionOverwrites.edit(targetId, { 
                    Connect: true, 
                    ViewChannel: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    MoveMembers: true
                });
                await interaction.editReply({ content: `✅ تم إعطاء (سماح اداري) لـ <@${targetId}>.` });
                if (logChannel) {
                    const embed = new EmbedBuilder().setColor(0x00FF00).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Grant Admin Permissions').setDescription(`**To:** \`${targetTag}\`\n**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                break;
            }

            case 'btn_deny': {
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                const targetTag = targetMember ? targetMember.user.tag : targetId;

                await channel.permissionOverwrites.edit(targetId, { 
                    MuteMembers: false,
                    DeafenMembers: false,
                    MoveMembers: false
                });
                await interaction.editReply({ content: `🚫 تم تنفيذ (ازالة اداري) عن <@${targetId}>.` });
                if (logChannel) {
                    const embed = new EmbedBuilder().setColor(0xFF0000).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Remove Admin Permissions').setDescription(`**To:** \`${targetTag}\`\n**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                break;
            }

            case 'btn_kick': {
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === channel.id) {
                    const targetTag = targetMember.user.tag;
                    await targetMember.voice.disconnect().catch(() => {});
                    await interaction.editReply({ content: `🚫 تم طرد <@${targetId}>.` });
                    if (logChannel) {
                        const embed = new EmbedBuilder().setColor(0xFF0000).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Kick Member from Voice').setDescription(`**To:** \`${targetTag}\`\n**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                        logChannel.send({ embeds: [embed] }).catch(() => {});
                    }
                } else {
                    await interaction.editReply({ content: '❌ العضو غير موجود بالروم.' });
                }
                break;
            }

            case 'btn_mute': {
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === channel.id) {
                    const targetTag = targetMember.user.tag;
                    await targetMember.voice.setMute(true).catch(() => {});
                    await interaction.editReply({ content: `🔇 تم إعطاء Server Mute لـ <@${targetId}>.` });
                    if (logChannel) {
                        const embed = new EmbedBuilder().setColor(0xFF0000).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Server Mute Member').setDescription(`**To:** \`${targetTag}\`\n**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                        logChannel.send({ embeds: [embed] }).catch(() => {});
                    }
                } else {
                    await interaction.editReply({ content: '❌ العضو غير موجود بالروم.' });
                }
                break;
            }

            case 'btn_unmute': {
                const targetId = selectedUsers.get(channel.id);
                if (!targetId || targetId === 'none') return interaction.editReply({ content: '❌ يرجى اختيار العضو من القائمة المنسدلة أولاً!' });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (targetMember && targetMember.voice.channelId === channel.id) {
                    const targetTag = targetMember.user.tag;
                    await targetMember.voice.setMute(false).catch(() => {});
                    await interaction.editReply({ content: `🔊 تم فك Server Mute عن <@${targetId}>.` });
                    if (logChannel) {
                        const embed = new EmbedBuilder().setColor(0x00FF00).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('UnMute Member').setDescription(`**To:** \`${targetTag}\`\n**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                        logChannel.send({ embeds: [embed] }).catch(() => {});
                    }
                } else {
                    await interaction.editReply({ content: '❌ العضو غير موجود بالروم.' });
                }
                break;
            }

            case 'btn_delete':
                tempChannels.delete(channel.id);
                selectedUsers.delete(channel.id);
                
                if (roomIntervals.has(channel.id)) {
                    clearInterval(roomIntervals.get(channel.id));
                    roomIntervals.delete(channel.id);
                }

                await interaction.editReply({ content: '🗑️ جاري حذف الروم...' });
                if (logChannel) {
                    const embed = new EmbedBuilder().setColor(0xFF0000).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Delete Channel Manually').setDescription(`**By:** \`${userTag}\`\n**Channel:** \`${channelName}\``).setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
                await channel.delete().catch(() => {});
                break;
        }
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const userTag = interaction.user.tag;
        const channelName = channel.name;

        if (interaction.customId === 'modal_rename') {
            const newName = interaction.fields.getTextInputValue('new_name');
            await channel.setName(newName).catch(() => {});
            await interaction.editReply({ content: `✅ تم تغيير اسم الروم إلى: **${newName}**` });
            if (logChannel) {
                const embed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Rename Voice Channel').setDescription(`**New Name:** \`${newName}\`\n**By:** \`${userTag}\``).setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }

        if (interaction.customId === 'modal_limit') {
            const limit = parseInt(interaction.fields.getTextInputValue('new_limit'));
            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.editReply({ content: '❌ يرجى إدخال رقم صحيح.' });
            await channel.setUserLimit(limit).catch(() => {});
            await interaction.editReply({ content: `✅ تم تغيير حد الأعضاء إلى: **${limit}**` });
            if (logChannel) {
                const embed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: userTag, iconURL: interaction.user.displayAvatarURL() }).setTitle('Change Channel User Limit').setDescription(`**Limit:** \`${limit}\`\n**By:** \`${userTag}\`\n**In:** \`${channelName}\``).setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }
});

// 🌐 خادم Express متوافق مع Render Free
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${port}`);
});

client.login(process.env.TOKEN);
