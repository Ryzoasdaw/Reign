const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const express = require('express');

// إعداد سيرفر Express البسيط عشان Render يلقى بورت مفتوح وما يقفل التطبيق
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is active and running!');
});

app.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});

// إعداد بوت الديسكورد
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const userVoiceActivity = new Map();
const tempVoiceChannels = new Map();

function buildTempRoomControlUI(userTag) {
    return { content: `مرحباً بك ${userTag} في رومك الصوتي الخاص.` };
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;

    if (!member || member.user.bot) return;

    const userId = member.id;
    const userData = userVoiceActivity.get(userId) || { voiceTime: 0, joinTimestamp: null };
    const logChannel = process.env.LOG_CHANNEL_ID ? guild.channels.cache.get(process.env.LOG_CHANNEL_ID) : null;

    // تتبع وقت الVOICE
    if (!oldState.channelId && newState.channelId) {
        userData.joinTimestamp = Date.now();
        userVoiceActivity.set(userId, userData);
    } else if (oldState.channelId && !newState.channelId) {
        if (userData.joinTimestamp) {
            userData.voiceTime += (Date.now() - userData.joinTimestamp);
            userData.joinTimestamp = null;
            userVoiceActivity.set(userId, userData);
        }
    }

    // إنشاء الروم المؤقت
    if (newState.channelId && newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            const parentCategory = process.env.CATEGORY_ID || null;
            const fetchedMember = await guild.members.fetch(member.id).catch(() => member);
            const roomName = `🔊 | ${fetchedMember.displayName}`;

            const channelOptions = {
                name: roomName,
                type: ChannelType.GuildVoice,
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
                ]
            };

            if (parentCategory) {
                channelOptions.parent = parentCategory;
            }

            const tempVoiceChannel = await guild.channels.create(channelOptions);

            tempVoiceChannels.set(tempVoiceChannel.id, member.id);
            await member.voice.setChannel(tempVoiceChannel).catch(() => {});

            setTimeout(async () => {
                const welcomeData = buildTempRoomControlUI(`<@${member.id}>`);
                await tempVoiceChannel.send(welcomeData).catch(err => console.error("خطأ في إرسال لوحة الروم:", err));
            }, 500);

            if (logChannel) {
                const categoryObj = parentCategory ? guild.channels.cache.get(parentCategory) : null;
                const categoryName = categoryObj ? categoryObj.name : 'No Category';
                
                logChannel.send({
                    embeds: [{
                        color: 0x00ff87,
                        title: 'Create Temporary Channel',
                        fields: [
                            { name: 'Channel', value: `🔊 ${roomName}`, inline: true },
                            { name: 'By', value: `<@${member.id}>`, inline: true },
                            { name: 'In', value: `# ${categoryName}`, inline: true }
                        ],
                        timestamp: new Date().toISOString()
                    }]
                }).catch(() => {});
            }

        } catch (error) {
            console.error('خطأ أثناء إنشاء الروم الصوتي:', error);
        }
    }

    // حذف الروم الصوتي إذا فاضي
    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const voiceChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (voiceChannel && voiceChannel.members.size === 0) {
            tempVoiceChannels.delete(voiceChannel.id);
            await voiceChannel.delete().catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
