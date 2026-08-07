const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

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

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;

    if (!member || member.user.bot) return;

    const userId = member.id;
    const userData = userVoiceActivity.get(userId) || { voiceTime: 0, joinTimestamp: null };
    const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

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

    if (newState.channelId && newState.channelId === process.env.JOIN_CHANNEL_ID) {
        try {
            const parentCategory = process.env.CATEGORY_ID || null;
            const fetchedMember = await guild.members.fetch(member.id).catch(() => member);
            const roomName = `🔊 | ${fetchedMember.displayName}`;

            const tempVoiceChannel = await guild.channels.create({
                name: roomName,
                type: ChannelType.GuildVoice,
                parent: parentCategory,
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
                ]
            });

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

    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const voiceChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (voiceChannel && voiceChannel.members.size === 0) {
            tempVoiceChannels.delete(voiceChannel.id);
            await voiceChannel.delete().catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
